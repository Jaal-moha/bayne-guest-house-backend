import { Min, MinLength } from "class-validator";

export class CreateRoomDto {
  @MinLength(3)
  number: string;

  @MinLength(3)
  type: string;

  @Min(500)
  price: number;
}