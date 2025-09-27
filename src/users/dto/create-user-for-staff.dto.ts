import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ROLE_VALUES = [
  'admin','manager','reception','housekeeping','barista','security','finance','store',
] as const;

export type RoleLiteral = typeof ROLE_VALUES[number];

export class CreateUserForStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // role is optional when creating a user for an existing staff member
  @IsOptional()
  @IsIn(ROLE_VALUES)
  role?: RoleLiteral;
}
