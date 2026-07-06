import { IsString, MaxLength, MinLength } from "class-validator";

export class  UpdateChatRoomDto {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    title!: string;
}