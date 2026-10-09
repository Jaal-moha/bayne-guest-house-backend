import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map } from 'rxjs';

// Prisma.Decimal serializes as a string, and the frontend calls .toFixed on these fields.
// DECIMAL(12, 2) has at most 12 significant digits, so every value survives as a JS number.
const toJsonNumbers = (value: unknown): unknown => {
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(toJsonNumbers);
  if (value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as object).map(([k, v]) => [k, toJsonNumbers(v)]),
    );
  }
  return value;
};

@Injectable()
export class DecimalToNumberInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(toJsonNumbers));
  }
}
