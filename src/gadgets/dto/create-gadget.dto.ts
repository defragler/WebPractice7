import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class CreateGadgetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  price: number;

  @IsInt()
  @Min(0)
  warrantyMonths: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cpu: string;

  @IsInt()
  @Min(0)
  ramGb: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
