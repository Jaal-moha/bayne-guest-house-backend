import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SeriesPoint = { date: string; revenue: number; checkIns: number };

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  private endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }
  private nights(checkIn: Date, checkOut: Date) {
    const ms = checkOut.getTime() - checkIn.getTime();
    const n = Math.ceil(ms / 86_400_000);
    return n <= 0 ? 1 : n;
  }

  async overview(range?: { start?: Date; end?: Date }) {
    const now = new Date();

    // lifetime mode when no range provided
    const isLifetime = !range;
    // determine start/end from provided range or default to today (only used when not lifetime)
    const start = !isLifetime
      ? range?.start
        ? this.startOfDay(range.start)
        : this.startOfDay(now)
      : undefined;
    const end = !isLifetime
      ? range?.end
        ? this.endOfDay(range.end)
        : this.endOfDay(now)
      : undefined;

    const isTodayRange =
      !isLifetime &&
      start!.getTime() === this.startOfDay(now).getTime() &&
      end!.getTime() === this.endOfDay(now).getTime();

    const [totalRooms, occupiedRoomsAtEnd, totalGuests, totalBookings, totalPayments, inventoryCount] =
      await Promise.all([
        this.prisma.room.count(),
        // occupied rooms at "end" (use now for lifetime to reflect current occupancy)
        this.prisma.booking.count({
          where: { checkIn: { lte: isLifetime ? now : end }, checkOut: { gt: isLifetime ? now : end } },
        }),
        this.prisma.guest.count(),
        this.prisma.booking.count(),
        this.prisma.payment.count(),
        this.prisma.inventory.count(),
      ]);

    const occupancyRate =
      totalRooms > 0 ? Math.round((occupiedRoomsAtEnd / totalRooms) * 100) : 0;

    // --- Low stock count (tolerant to missing minThreshold in generated types) ---
    type MaybeInv = { quantity: number; minThreshold?: number | null };
    const lowItems = await (this.prisma.inventory as any).findMany({
      select: { quantity: true, minThreshold: true },
    });
    const lowStockCount = (lowItems as MaybeInv[]).filter(
      (i) => i.quantity <= (i.minThreshold ?? 0),
    ).length;

    // Build queries depending on lifetime vs range
    const arrivalsPromise = isLifetime
      ? this.prisma.booking.count()
      : this.prisma.booking.count({ where: { checkIn: { gte: start, lte: end } } });

    const departuresPromise = isLifetime
      ? this.prisma.booking.count()
      : this.prisma.booking.count({ where: { checkOut: { gte: start, lte: end } } });

    const paidAggPromise = isLifetime
      ? this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'paid' } })
      : this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'paid', createdAt: { gte: start, lte: end } },
        });

    const unpaidBookingsPromise = isLifetime
      ? this.prisma.booking.findMany({
          where: {
            OR: [{ payment: null }, { payment: { is: { status: { not: 'paid' } } } }],
          },
          include: { room: true },
        })
      : this.prisma.booking.findMany({
          where: {
            AND: [
              {
                OR: [
                  { checkIn: { gte: start, lte: end } },
                  { checkOut: { gte: start, lte: end } },
                  { AND: [{ checkIn: { lte: start } }, { checkOut: { gte: end } }] },
                ],
              },
              {
                OR: [
                  { payment: null },
                  { payment: { is: { status: { not: 'paid' } } } },
                ],
              },
            ],
          },
          include: { room: true },
        });

    const [arrivalsCount, departuresCount, paidAgg, unpaidBookings] = await Promise.all([
      arrivalsPromise,
      departuresPromise,
      paidAggPromise,
      unpaidBookingsPromise,
    ]);

    let unpaidTotal = 0;
    for (const b of unpaidBookings) {
      const n = this.nights(b.checkIn, b.checkOut);
      const price = b.room?.price ?? 0;
      unpaidTotal += n * price;
    }

    const staffCount = 0;
    const laundryCount = 0;

    // return fields: when lifetime, set a lifetime flag and use generic arrivals/departures names;
    // when a specific range is provided, preserve previous today-compatibility naming.
    return {
      lifetime: isLifetime,
      guests: totalGuests,
      bookings: totalBookings,
      rooms: totalRooms,
      payments: totalPayments,
      staff: staffCount,
      inventory: inventoryCount,
      laundry: laundryCount,
      revenue: paidAgg._sum.amount ?? 0,

      occupiedRoomsNow: occupiedRoomsAtEnd,
      occupancyRate,
      ...(isLifetime
        ? { arrivals: arrivalsCount, departures: departuresCount }
        : isTodayRange
        ? { arrivalsToday: arrivalsCount, departuresToday: departuresCount }
        : { arrivals: arrivalsCount, departures: departuresCount }),
      unpaidBookingsCount: unpaidBookings.length,
      unpaidTotal,
      lowStockCount,
    };
  }

  async series(days = 7): Promise<SeriesPoint[]> {
    const clamped = Math.max(1, Math.min(31, days));
    const today = this.startOfDay(new Date());
    const out: SeriesPoint[] = [];

    for (let i = clamped - 1; i >= 0; i--) {
      const dayStart = new Date(today);
      dayStart.setDate(today.getDate() - i);
      const dayEnd = this.endOfDay(dayStart);

      const [revAgg, checkIns] = await Promise.all([
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'paid', createdAt: { gte: dayStart, lte: dayEnd } },
        }),
        this.prisma.booking.count({
          where: { checkIn: { gte: dayStart, lte: dayEnd } },
        }),
      ]);

      out.push({
        date: dayStart.toISOString().slice(0, 10),
        revenue: revAgg._sum.amount ?? 0,
        checkIns,
      });
    }
    return out;
  }
}
