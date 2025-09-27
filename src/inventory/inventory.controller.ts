import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, Query, ParseIntPipe } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

interface InventoryMovement {
  id: number;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;          // For ADJUST = new absolute quantity; IN/OUT = delta
  reason?: string;
  createdAt: string;
  resultingQuantity: number;
}

// In‑memory movement storage (process-local; reset on restart)
// TODO: Replace with persistent table (e.g. inventoryMovement) in Prisma.
const movementStore: Record<number, InventoryMovement[]> = {};
let movementSeq = 1;

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  async findAll(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('low') low?: string,
  ) {
    // Fetch all first (service has no filtering yet)
    const list = await this.inventoryService.findAll();
    const tq = (q || '').trim().toLowerCase();
    let filtered = list;

    if (category) {
      filtered = filtered.filter(i => i.category === category);
    }
    if (tq) {
      filtered = filtered.filter(i =>
        [i.name, i.category, i.sku, String(i.quantity)]
          .filter(Boolean)
          .some(v => v!.toString().toLowerCase().includes(tq))
      );
    }
    if (low === 'true') {
      filtered = filtered.filter(i => {
        const min = (i as any).minThreshold ?? 0;
        return i.quantity <= min;
      });
    }
    return filtered;
  }

  @Get('metrics')
  async metrics() {
    const list = await this.inventoryService.findAll();

    const totalItems = list.length;
    const totalQuantity = list.reduce((sum, i: any) => sum + (i.quantity ?? 0), 0);
    const lowStock = list.filter(i => {
      const min = (i as any).minThreshold ?? 0;
      return (i as any).quantity <= min;
    }).length;

    const categories: Record<string, { count: number; quantity: number }> = {};
    for (const i of list as any[]) {
      const cat = i.category || 'uncategorized';
      if (!categories[cat]) categories[cat] = { count: 0, quantity: 0 };
      categories[cat].count += 1;
      categories[cat].quantity += i.quantity ?? 0;
    }

    return {
      totalItems,
      totalQuantity,
      lowStock,
      categories,
    };
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateInventoryDto: UpdateInventoryDto) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.remove(id);
  }

  @Post(':id/movements')
  async createMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { type: 'IN' | 'OUT' | 'ADJUST'; quantity: number; reason?: string }
  ) {
    const { type, quantity } = body || {};
    if (!type || !['IN', 'OUT', 'ADJUST'].includes(type)) throw new BadRequestException('Invalid movement type');
    if (quantity === undefined || quantity === null || isNaN(quantity)) throw new BadRequestException('Quantity required');
    if (type !== 'ADJUST' && quantity <= 0) throw new BadRequestException('Quantity must be > 0');

    const item = await this.inventoryService.findOne(id);
    if (!item) throw new BadRequestException('Item not found');

    let newQuantity: number;
    if (type === 'IN') {
      newQuantity = item.quantity + quantity;
    } else if (type === 'OUT') {
      if (quantity > item.quantity) throw new BadRequestException('Insufficient stock');
      newQuantity = item.quantity - quantity;
    } else {
      if (quantity < 0) throw new BadRequestException('Quantity cannot be negative');
      newQuantity = quantity; // absolute set
    }

    const updated = await this.inventoryService.update(id, { quantity: newQuantity });

    const movement: InventoryMovement = {
      id: movementSeq++,
      type,
      quantity,
      reason: body.reason,
      createdAt: new Date().toISOString(),
      resultingQuantity: newQuantity,
    };
    movementStore[id] = movementStore[id] ? [movement, ...movementStore[id]] : [movement];

    // Frontend expects updated item; history modal separately pulls /:id/movements
    return await this.inventoryService.findOne(id); // ensure fresh value returned
  }

  @Get(':id/movements')
  async listMovements(@Param('id', ParseIntPipe) id: number) {
    // Returns in-memory list (most recent first)
    return movementStore[id] ?? [];
  }
}
