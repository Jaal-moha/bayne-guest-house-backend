import { BlankAsMissing, ToOptionalNumber } from '../../validation';
import { Transform } from 'class-transformer';
import { PaymentMethod, PaymentServiceType, PaymentStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePaymentDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(PaymentServiceType)
  serviceType?: PaymentServiceType;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  bookingId?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  guestId?: number;

  // The guest card form sends card details. Drop them here so they are never stored or logged.
  @IsOptional()
  @Transform(() => undefined, { toClassOnly: true })
  details?: Record<string, unknown>;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  amount?: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @BlankAsMissing()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;     // ← NEW
}
