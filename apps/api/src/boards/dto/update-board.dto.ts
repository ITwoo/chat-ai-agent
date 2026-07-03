import type { BoardStatus, UpdateBoardRequest } from "@repo/shared";
import { IsNotEmpty } from "class-validator";

export class UpdateBoardDto implements UpdateBoardRequest{
    @IsNotEmpty()
    title!: string;

    @IsNotEmpty()
    description!: string;
    
    @IsNotEmpty()
    status!: BoardStatus;
}