import { IsInt, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const LAUNDRY_STATUSES = ['pending', 'in_progress', 'done'] as const;

export class CreateLaundryDto {
  @IsInt()
  guestId!: number;

  @IsString()
  @MaxLength(1000)
  items!: string; // e.g., "2x sheets, 3x towels"

  @IsOptional()
  @IsIn(LAUNDRY_STATUSES as unknown as string[])
  status?: string; // default 'pending' if omitted
}
