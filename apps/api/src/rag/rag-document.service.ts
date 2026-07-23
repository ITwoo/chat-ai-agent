import { Injectable, Logger } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RagDocumentService {
    private readonly logger = new Logger(RagDocumentService.name);

    constructor(private readonly prisma: PrismaService) {}

    async createPendingDocument(
        userId: number,
        file: Express.Multer.File,
    ) {
        try {
            return await this.prisma.ragDocument.create({
                data: {
                    userId,
                    fileName: file.originalname,
                    storageKey: file.filename,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                },
                select: {
                    id: true,
                    fileName: true,
                    mimeType: true,
                    sizeBytes: true,
                    status: true,
                    createdAt: true,
                },
            });
        } catch (error) {
            await unlink(file.path).catch((cleanupError: unknown) => {
                this.logger.warn(
                    `RAG 업로드 파일 정리 실패: ${String(cleanupError)}`,
                );
            });

            throw error;
        }
    }
}