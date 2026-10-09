import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { FitsBcrypt } from '../../validation';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @FitsBcrypt()
  newPassword!: string;
}
