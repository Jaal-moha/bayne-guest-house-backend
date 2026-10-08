import { InventoryMoveType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ToOptionalNumber } from '../../validation';

export class CreateMovementDto {
  @IsEnum(InventoryMoveType)
  type!: InventoryMoveType;

  @ToOptionalNumber()
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
