import { IsInt, IsDateString } from 'class-validator';

export class CreateBookingDto {
  @IsInt()
  guestId: number;

  @IsInt()
  roomId: number;

  @IsDateString()
  checkIn: string;

  @IsDateString()
  checkOut: string;
}
