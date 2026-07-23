import {
    Controller,
    ParseFilePipeBuilder,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { JwtGuard } from '../auth/guard/jwt.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RagDocumentService } from './rag-document.service';

@Controller('rag/documents')
@UseGuards(JwtGuard)
export class RagDocumentController {
    constructor(
        private readonly ragDocumentService: RagDocumentService,
    ) {}

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    uploadDocument(
        @GetUser() user: AuthUser,
        @UploadedFile(new ParseFilePipeBuilder().build())
        file: Express.Multer.File,
    ) {
        return this.ragDocumentService.createPendingDocument(
            user.id,
            file,
        );
    }
}