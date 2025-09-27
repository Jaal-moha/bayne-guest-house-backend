import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from './create-payment.dto';

export class UpdatePaymentDto {
  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method?: string;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;     // ← NEW
}
