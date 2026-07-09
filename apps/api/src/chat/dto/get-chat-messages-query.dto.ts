import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class GetChatMessagesQueryDto {
    @IsOptional()
    @Type(()=>Number)
    @IsInt()
    cursor?: number;

    @IsOptional()
    @Type(()=>Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}