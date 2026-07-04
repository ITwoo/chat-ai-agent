import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;
}