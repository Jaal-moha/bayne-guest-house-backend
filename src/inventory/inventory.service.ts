import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Prisma, InventoryMoveType } from '@prisma/client';

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

  // LIST with optional filters; low stock filter applied in memory for simplicity
  async findAll(params?: { q?: string; category?: string; low?: boolean }) {
    const q = params?.q?.trim();
    const category = params?.category?.trim();
    const onlyLow = !!params?.low;

    const where: Prisma.InventoryWhereInput = {
      AND: [
        category ? { category } : undefined,
        q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
      ].filter(Boolean) as Prisma.InventoryWhereInput[],
    };

    const items = await this.prisma.inventory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return onlyLow
      ? items.filter((i) => i.quantity <= (i.minThreshold ?? 0))
      : items;
  }

  async findOne(id: number) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
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

    return this.prisma.inventory.update({ where: { id }, data });
  }

  async remove(id: number) {
    return this.prisma.inventory.delete({ where: { id } });
  }

  // --- Stock Movements ---

  async moveIn(id: number, quantity: number, reason?: string) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive number');
    }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventory.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Item not found');

      const updated = await tx.inventory.update({
        where: { id },
        data: { quantity: item.quantity + quantity },
      });

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
      const item = await tx.inventory.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Item not found');
      if (quantity > item.quantity) {
        throw new BadRequestException('Insufficient stock');
      }

      const updated = await tx.inventory.update({
        where: { id },
        data: { quantity: item.quantity - quantity },
      });

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
      const item = await tx.inventory.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Item not found');

      const updated = await tx.inventory.update({
        where: { id },
        data: { quantity: newQuantity },
      });

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
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');

    return this.prisma.inventoryMovement.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
    });
  }
}
