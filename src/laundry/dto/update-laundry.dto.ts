import { Type } from 'class-transformer';
import { IsNumber, Min, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LAUNDRY_STATUSES } from './create-laundry.dto';

export class UpdateLaundryDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  items?: string;

  @IsOptional()
  @IsIn(LAUNDRY_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;
}
