import { InventoryMoveType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { INT4_MAX, ToOptionalNumber } from '../../validation';

export class CreateMovementDto {
  @IsEnum(InventoryMoveType)
  type!: InventoryMoveType;

  @ToOptionalNumber()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
