import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import type {
    RagDocumentExtractionInput,
    RagDocumentExtractionResult,
    RagDocumentTextExtractor,
    RagExtractedSection,
} from './rag-document-extractor.types';

@Injectable()
export class RagPdfFileExtractor implements RagDocumentTextExtractor {
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
                const content = result.text.trim();

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

            const message = error instanceof Error ? error.message : String(error);

            throw new UnrecoverableError(
                `PDF 텍스트 추출에 실패했습니다: ${message}`,
            );
        } finally {
            await parser.destroy();
        }
    }
}