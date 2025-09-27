import { IsInt, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export const PAYMENT_METHODS = ['cash', 'card', 'mobile', 'bank_transfer'] as const;
export const PAYMENT_STATUSES = ['paid', 'refunded', 'failed', 'Unpaid'] as const;

export class CreatePaymentDto {
  @IsInt()
  bookingId!: number;

  @IsOptional()
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
