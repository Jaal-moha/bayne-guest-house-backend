import { IsIn, IsOptional, IsString, MinLength, IsEmail, IsBoolean } from 'class-validator';

export const ROLE_VALUES = [
  'admin','manager','reception','housekeeping','barista','security','finance','store',
] as const;

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsIn(ROLE_VALUES)
  role: string;

  @IsString()
  @MinLength(7)
  phone: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsEmail()
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  forceChangePassword?: boolean;
}