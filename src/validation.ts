import { Transform } from 'class-transformer';
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
