// dto/create-guest.dto.ts
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateGuestDto {
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsString()
  @Length(3, 30)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  // If you want strict phone validation, swap to IsPhoneNumber('ET') (or your locale)
  phone: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  // include this ONLY if you actually accept it from the client
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}
