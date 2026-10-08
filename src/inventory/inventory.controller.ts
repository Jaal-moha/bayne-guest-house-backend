import { Controller, Get, Post, Body, Patch, Param, Delete, DefaultValuePipe, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { InventoryMoveType } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'manager', 'store', 'barista', 'reception')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll(@Query('q') q?: string, @Query('category') category?: string, @Query('low') low?: string) {
    return this.inventoryService.findAll({ q, category, low: low === 'true' });
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
  @Roles('admin', 'manager', 'store')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateInventoryDto: UpdateInventoryDto) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.remove(id);
  }

  @Post(':id/movements')
  createMovement(@Param('id', ParseIntPipe) id: number, @Body() body: CreateMovementDto) {
    if (body.type === InventoryMoveType.IN) return this.inventoryService.moveIn(id, body.quantity, body.reason);
    if (body.type === InventoryMoveType.OUT) return this.inventoryService.moveOut(id, body.quantity, body.reason);
    return this.inventoryService.adjust(id, body.quantity, body.reason);
  }

  @Get(':id/movements')
  listMovements(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.inventoryService.movements(id, limit);
  }
}
