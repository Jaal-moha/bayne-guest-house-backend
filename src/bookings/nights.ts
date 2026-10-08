const DAY_MS = 86_400_000;

// Billing counts whole nights and charges at least one, so a late check-out is not an extra night.
export function nights(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.floor((checkOut.getTime() - checkIn.getTime()) / DAY_MS));
}
