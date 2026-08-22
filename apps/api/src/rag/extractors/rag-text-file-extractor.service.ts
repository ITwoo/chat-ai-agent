import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';

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
        const content = input.data.toString('utf8');
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