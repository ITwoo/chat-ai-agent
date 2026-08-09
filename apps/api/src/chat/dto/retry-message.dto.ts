import { IsInt, Min } from 'class-validator';

export class RetryMessageDto {
    @IsInt()
    @Min(1)
    roomId!: number;

    @IsInt()
    @Min(1)
    userMessageId!: number;
}