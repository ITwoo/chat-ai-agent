import {
    Controller,
    Delete,
    Get,
    Param,
    ParseFilePipeBuilder,
    ParseIntPipe,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { JwtGuard } from '../auth/guard/jwt.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RagDocumentService } from './rag-document.service';
import { GetRagDocumentsQueryDto } from './dto/get-rag-documents-query.dto';

@Controller('rag/documents')
@UseGuards(JwtGuard)
export class RagDocumentController {
    constructor(
        private readonly ragDocumentService: RagDocumentService,
    ) {}

    @Get()
    getDocuments(@GetUser() user: AuthUser, @Query() query: GetRagDocumentsQueryDto) {
        return this.ragDocumentService.getDocuments(user.id, query);
    }

    @Post(':documentId/reprocess')
    reprocessDocument(@GetUser() user: AuthUser, @Param('documentId', ParseIntPipe) documentId: number) {
        return this.ragDocumentService.reprocessDocument(user.id, documentId);
    }

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

    @Delete(':documentId')
    deleteDocument(@GetUser() user: AuthUser, @Param('documentId', ParseIntPipe) documentId: number) {
        return this.ragDocumentService.deleteDocument(user.id, documentId);
    }
}