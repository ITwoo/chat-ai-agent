import type { CreateBoardRequest } from "@repo/shared";
import { IsNotEmpty } from "class-validator";

export class CreateBoardDto implements CreateBoardRequest {

    @IsNotEmpty()
    title!: string;

    @IsNotEmpty()
    description!: string;
}