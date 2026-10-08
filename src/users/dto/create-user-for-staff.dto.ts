import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserForStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // role is optional when creating a user for an existing staff member
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
