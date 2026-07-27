import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { readFile } from 'node:fs/promises';
import type {
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagDocumentTextExtractor,
} from './rag-document-extractor.types';

@Injectable()
export class RagTextFileExtractor implements RagDocumentTextExtractor {
    supports(extension: string): boolean {
        return extension === '.txt';
    }

    async extract(input: RagDocumentExtractionInput): Promise<RagDocumentExtractionResult> {
        let content: string;

        try {
            content = await readFile(input.filePath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new UnrecoverableError(
                    `RAG 원본 파일을 찾을 수 없습니다: storageKey=${input.storageKey}`,
                );
            }

            throw error;
        }

        const normalizedContent = content.replace(/^\uFEFF/, '').trim();

        if (!normalizedContent) {
            throw new UnrecoverableError('RAG 문서가 비어 있습니다.');
        }

        return {
            sections: [
                {
                    content: normalizedContent,
                    pageNumber: null,
                },
            ],
        };
    }
}