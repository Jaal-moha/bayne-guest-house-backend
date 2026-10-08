import { ToOptionalNumber } from '../../validation';
import { LaundryStatus } from '@prisma/client';
import { IsNumber, Min, IsInt, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLaundryDto {
  @ToOptionalNumber()
  @IsInt()
  guestId!: number;

  @IsString()
  @MaxLength(1000)
  items!: string; // e.g., "2x sheets, 3x towels"

  @IsOptional()
  @IsEnum(LaundryStatus)
  status?: LaundryStatus; // default 'pending' if omitted

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(0)
  price?: number;
}
