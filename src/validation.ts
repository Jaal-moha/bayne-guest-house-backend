import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { ValidationPipeOptions } from '@nestjs/common';

export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};

// Form fields arrive as strings, and a cleared field arrives as '' or null.
// Treat those as missing so services apply their defaults instead of storing 0.
export const ToOptionalNumber = () =>
  Transform(({ value }) =>
    value === null || (typeof value === 'string' && value.trim() === '') ? undefined : Number(value),
  );

// A cleared select arrives as '' or null. Treat it as missing so the column default applies.
export const BlankAsMissing = () =>
  Transform(({ value }) => (value === null || value === '' ? undefined : value));

// Postgres INT4, which every Int column in the schema is.
export const INT4_MAX = 2_147_483_647;

// bcrypt reads only the first 72 bytes, so a longer password also matches every password sharing that prefix.
export const FitsBcrypt = () =>
  ValidateBy({
    name: 'fitsBcrypt',
    validator: {
      validate: (value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= 72,
      defaultMessage: () => '$property must be at most 72 bytes',
    },
  });

// Every money column is DECIMAL(12,2). Postgres rounds extra decimals (0.001 becomes 0.00)
// and fails with a 500 at 1e10 or more, so both get a 400 here.
// Not @IsNumber({ maxDecimalPlaces: 2 }): it throws on values that print in exponent form, like 1e-7.
export const MONEY_LIMIT = 1e10;
export const IsMoney = () =>
  ValidateBy({
    name: 'isMoney',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' &&
        Math.abs(value) < MONEY_LIMIT &&
        Number(value.toFixed(2)) === value,
      defaultMessage: () =>
        `$property must be a number with at most 2 decimal places, below 10,000,000,000`,
    },
  });
