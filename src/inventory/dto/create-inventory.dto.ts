import { IsInt, IsIn, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(120)
  category!: string;

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
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minThreshold?: number;
}
