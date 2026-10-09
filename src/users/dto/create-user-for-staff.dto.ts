import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FitsBcrypt } from '../../validation';

export class CreateUserForStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @FitsBcrypt()
  password!: string;

  // role is optional when creating a user for an existing staff member
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
