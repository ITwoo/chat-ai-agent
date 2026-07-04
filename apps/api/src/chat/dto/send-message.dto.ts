import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class SendMessageDto {
    @IsInt()
    @Min(1)
    roomId!: number;

    @IsString()
    @MinLength(1)
    content!: string;
}