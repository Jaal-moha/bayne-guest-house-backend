import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength, IsEmail, IsBoolean } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(Role)
  role: Role;

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