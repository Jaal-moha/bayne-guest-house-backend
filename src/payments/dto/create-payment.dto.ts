import { ToOptionalNumber } from '../../validation';
import { Transform } from 'class-transformer';
import { PaymentServiceType } from '@prisma/client';
import { IsEnum, IsInt, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export const PAYMENT_METHODS = ['cash', 'card', 'mobile', 'e_birr', 'cbe', 'cbe_birr', 'bank_transfer'] as const;
export const PAYMENT_STATUSES = ['paid', 'refunded', 'failed', 'unpaid'] as const;

export class CreatePaymentDto {
  @IsOptional()
  @IsEnum(PaymentServiceType)
  serviceType?: PaymentServiceType;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  bookingId?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  laundryId?: number;

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

  @IsIn(PAYMENT_METHODS as unknown as string[])
  method!: string;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES as unknown as string[])
  status?: string; // default 'paid'

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;     // ← NEW
}
