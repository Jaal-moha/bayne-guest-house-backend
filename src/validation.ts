import { Transform } from 'class-transformer';
import { ValidationPipeOptions } from '@nestjs/common';
import { ValidateBy } from 'class-validator';

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
