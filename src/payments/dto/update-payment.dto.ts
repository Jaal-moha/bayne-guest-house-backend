import { BlankAsMissing, IsMoney, ToOptionalNumber } from '../../validation';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentDto {
  @IsOptional()
  @ToOptionalNumber()
  @IsMoney()
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @BlankAsMissing()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;     // ← NEW
}
