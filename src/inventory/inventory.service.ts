import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Prisma, Inventory, InventoryMoveType } from '@prisma/client';
import { INT4_MAX } from '../validation';

// Removing an item archives it so its movements survive. Every read and write below sees only active items.
const active = { archivedAt: null } as const;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // CREATE with safe defaults so Prisma types are satisfied
  async create(dto: CreateInventoryDto) {
    const data: Prisma.InventoryCreateInput = {
      name: dto.name,
      category: dto.category,
      unit: dto.unit ?? null,                  // 'pcs' | 'kg' | 'L' | null
      sku: dto.sku ?? null,
      quantity: dto.quantity ?? 0,             // <- default to 0 if undefined
      minThreshold: dto.minThreshold ?? 0,     // <- default to 0 if undefined
    };
    return this.prisma.inventory.create({ data });
  }

  // LIST with optional filters; low stock filter applied in memory for simplicity.
  // One statement, so a large match set or a concurrent update can't split the search from its rows.
  // Quantity matches as text, like the old in-memory filter the frontend relies on (q=12 finds 312).
  async findAll(params?: { q?: string; category?: string; low?: boolean }) {
    const q = params?.q?.trim() || null;
    const category = params?.category?.trim() || null;
    const pattern = q && `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    const items = await this.prisma.$queryRaw<Inventory[]>`
      SELECT * FROM "Inventory"
      WHERE "archivedAt" IS NULL
        AND (${category}::text IS NULL OR category = ${category})
        AND (${pattern}::text IS NULL
          OR name ILIKE ${pattern} OR category ILIKE ${pattern}
          OR sku ILIKE ${pattern} OR quantity::text LIKE ${pattern})
      ORDER BY "updatedAt" DESC`;

    return params?.low
      ? items.filter((i) => i.quantity <= (i.minThreshold ?? 0))
      : items;
  }

  async findOne(id: number) {
    const item = await this.prisma.inventory.findFirst({ where: { id, ...active } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async update(id: number, dto: UpdateInventoryDto) {
    // Build a typed update object without undefineds
    const data: Prisma.InventoryUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
      ...(dto.minThreshold !== undefined ? { minThreshold: dto.minThreshold } : {}),
      // Persist quantity updates (needed by movements)
      ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
    };

    return this.prisma.inventory.update({ where: { id, ...active }, data });
  }

  async remove(id: number) {
    return this.prisma.inventory.update({ where: { id, ...active }, data: { archivedAt: new Date() } });
  }

  // --- Stock Movements ---

  async moveIn(id: number, quantity: number, reason?: string) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive number');
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventory.updateMany({
        where: { id, ...active, quantity: { lte: INT4_MAX - quantity } },
        data: { quantity: { increment: quantity } },
      });
      if (count === 0) {
        if (!(await tx.inventory.findFirst({ where: { id, ...active } }))) throw new NotFoundException('Item not found');
        throw new BadRequestException(`Stock cannot exceed ${INT4_MAX}`);
      }
      const updated = await tx.inventory.findUniqueOrThrow({ where: { id } });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: id,
          type: InventoryMoveType.IN,
          quantity,
          reason: reason || null,
        },
      });

      return updated;
    });
  }

  async moveOut(id: number, quantity: number, reason?: string) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive number');
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventory.updateMany({
        where: { id, ...active, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (count === 0) {
        if (!(await tx.inventory.findFirst({ where: { id, ...active } }))) throw new NotFoundException('Item not found');
        throw new BadRequestException('Insufficient stock');
      }
      const updated = await tx.inventory.findUniqueOrThrow({ where: { id } });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: id,
          type: InventoryMoveType.OUT,
          quantity,
          reason: reason || null,
        },
      });

      return updated;
    });
  }

  // Set absolute quantity
  async adjust(id: number, newQuantity: number, reason?: string) {
    if (!Number.isFinite(newQuantity) || newQuantity < 0) {
      throw new BadRequestException('Quantity must be a non-negative number');
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventory.updateMany({ where: { id, ...active }, data: { quantity: newQuantity } });
      if (count === 0) throw new NotFoundException('Item not found');
      const updated = await tx.inventory.findUniqueOrThrow({ where: { id } });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: id,
          type: InventoryMoveType.ADJUST,
          quantity: newQuantity,
          reason: reason || null,
        },
      });

      return updated;
    });
  }

  async movements(id: number, limit = 100) {
    const item = await this.prisma.inventory.findFirst({ where: { id, ...active } });
    if (!item) throw new NotFoundException('Item not found');

    return this.prisma.inventoryMovement.findMany({
      where: { inventoryId: id },
      orderBy: { id: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
    });
  }
}
