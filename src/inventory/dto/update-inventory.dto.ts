import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { INT4_MAX } from '../../validation';

export class UpdateInventoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  // allow only pcs, kg, L
  @IsOptional()
  @IsIn(['pcs', 'kg', 'L'])
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  minThreshold?: number;
}
