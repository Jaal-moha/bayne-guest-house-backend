import { IsInt, IsDateString, IsOptional } from 'class-validator';

export class CreateAttendanceDto {
  @IsInt()
  staffId: number;

  

  @IsDateString()
  date: string;

  @IsDateString()
  checkIn: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;
}
