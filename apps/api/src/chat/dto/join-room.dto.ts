import { IsInt, Min } from 'class-validator';

export class JoinRoomDto {
    @IsInt()
    @Min(1)
    roomId!: number;
}