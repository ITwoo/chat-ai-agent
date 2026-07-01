import { BadRequestException, PipeTransform } from "@nestjs/common";
import { Board_Status } from '@repo/shared'

export class BoardStatusValidationPipe implements PipeTransform {

    readonly StatusOptions = [
        Board_Status.PUBLIC,
        Board_Status.PRIVATE,
    ];

    transform(value: any) {
        value = value.toUpperCase();
        if (!this.isStatusValid(value)) {
            throw new BadRequestException(`"${value}" is an invalid status options`);
        }
        return value;
    }

    private isStatusValid(status: any) {
        const index = this.StatusOptions.indexOf(status);
        return index !== -1;
    }
}