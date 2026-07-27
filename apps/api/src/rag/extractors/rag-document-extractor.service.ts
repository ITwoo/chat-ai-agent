import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import {
    extname,
    isAbsolute,
    relative,
    resolve,
    sep,
} from 'node:path';
import type { RagDocumentTextExtractor } from './rag-document-extractor.types';
import { RagTextFileExtractor } from './rag-text-file-extractor.service';

@Injectable()
export class RagDocumentExtractorService {
    private readonly extractors: RagDocumentTextExtractor[];

    constructor(
        private readonly configService: ConfigService,
        ragTextFileExtractor: RagTextFileExtractor,
    ) {
        this.extractors = [ragTextFileExtractor];
    }

    async extract(storageKey: string): Promise<string> {
        const uploadDir = resolve(
            process.cwd(),
            this.configService.get<string>('RAG_UPLOAD_DIR') ??
                'uploads/rag',
        );

        const filePath = resolve(uploadDir, storageKey);
        const relativeFilePath = relative(uploadDir, filePath);

        if (
            relativeFilePath === '..' ||
            relativeFilePath.startsWith(`..${sep}`) ||
            isAbsolute(relativeFilePath)
        ) {
            throw new UnrecoverableError(
                `허용되지 않는 RAG 파일 경로입니다: storageKey=${storageKey}`,
            );
        }

        const extension = extname(storageKey).toLowerCase();
        const extractor = this.extractors.find((candidate) =>
            candidate.supports(extension),
        );

        if (!extractor) {
            throw new UnrecoverableError(
                `지원하지 않는 RAG 문서 형식입니다: extension=${extension || '없음'}`,
            );
        }

        return extractor.extract({
            filePath,
            storageKey,
            extension,
        });
    }
}