import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { PasswordException, PDFParse } from 'pdf-parse';
import type {
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagDocumentTextExtractor,
    RagExtractedSection,
} from './rag-document-extractor.types';

@Injectable()
export class RagPdfFileExtractor implements RagDocumentTextExtractor {
    private readonly logger = new Logger(RagPdfFileExtractor.name);
    
    supports(extension: string): boolean {
        return extension === '.pdf';
    }

    async extract(input: RagDocumentExtractionInput): Promise<RagDocumentExtractionResult> {
        let data: Buffer;

        try {
            data = await readFile(input.filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new UnrecoverableError(
                    `RAG 원본 파일을 찾을 수 없습니다: storageKey=${input.storageKey}`,
                );
            }

            throw error;
        }

        const parser = new PDFParse({ data });

        try {
            const info = await parser.getInfo();
            const sections: RagExtractedSection[] = [];

            for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
                const result = await parser.getText({ partial: [pageNumber] });
                const content = this.normalizeText(result.text);

                if (!content) continue;

                sections.push({
                    content,
                    pageNumber,
                });
            }

            if (sections.length === 0) {
                throw new UnrecoverableError(
                    'PDF에서 추출할 텍스트를 찾을 수 없습니다. 이미지로만 구성된 스캔 PDF는 현재 지원하지 않습니다.',
                );
            }

            return { sections };
        } catch (error) {
            if (error instanceof UnrecoverableError) throw error;

            throw this.createExtractionError(input.storageKey, error);
        } finally {
            await parser.destroy();
        }
    }

    private normalizeText(text: string): string {
        return text
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200b-\u200d\uFEFF]/g, '')
            .replace(/\u0000/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    private createExtractionError(storageKey: string, error: unknown): UnrecoverableError {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.logger.error(
            `PDF 텍스트 추출 실패: storageKey=${storageKey}, errorName=${errorName}, error=${errorMessage}`,
        );

        if (error instanceof PasswordException) {
            return new UnrecoverableError(
                '암호로 보호된 PDF는 현재 처리할 수 없습니다.',
            );
        }

        return new UnrecoverableError(
            'PDF 파일이 손상됐거나 지원하지 않는 형식이어서 텍스트를 추출할 수 없습니다.',
        );
    }
}