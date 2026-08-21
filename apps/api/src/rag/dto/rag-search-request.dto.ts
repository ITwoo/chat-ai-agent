import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class RagSearchRequestDto {
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    query!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(200, { each: true })
    lexicalQueries?: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    limit?: number;
}