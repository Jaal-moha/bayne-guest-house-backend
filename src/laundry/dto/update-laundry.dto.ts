import { BlankAsMissing, ToOptionalNumber } from '../../validation';
import { LaundryStatus } from '@prisma/client';
import { IsNumber, Min, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLaundryDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  items?: string;

  @IsOptional()
  @BlankAsMissing()
  @IsEnum(LaundryStatus)
  status?: LaundryStatus;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class UpdateLaundryStatusDto {
  @IsEnum(LaundryStatus)
  status!: LaundryStatus;
}
