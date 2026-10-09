import { Min, MinLength } from "class-validator";
import { IsMoney } from "../../validation";

export class CreateRoomDto {
  @MinLength(3)
  number: string;

  @MinLength(3)
  type: string;

  @IsMoney()
  @Min(500)
  price: number;
}