import { ToOptionalNumber } from '../../validation';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentDto {
  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;     // ← NEW
}
