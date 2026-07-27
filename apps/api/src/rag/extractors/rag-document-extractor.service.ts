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
import type { RagDocumentExtractionInput, RagDocumentExtractionResult, RagDocumentTextExtractor } from './rag-document-extractor.types';
import { RagTextFileExtractor } from './rag-text-file-extractor.service';
import { RagPdfFileExtractor } from './rag-pdf-file-extractor.service';
import { open } from 'node:fs/promises';

const FILE_SIGNATURE_SAMPLE_SIZE = 8 * 1024;
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

@Injectable()
export class RagDocumentExtractorService {
    private readonly extractors: RagDocumentTextExtractor[];

    constructor(
        private readonly configService: ConfigService,
        ragTextFileExtractor: RagTextFileExtractor,
        ragPdfFileExtractor: RagPdfFileExtractor,
    ) {
        this.extractors = [
            ragTextFileExtractor,
            ragPdfFileExtractor,
        ];
    }

    async extract(storageKey: string): Promise<RagDocumentExtractionResult> {
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

        const input: RagDocumentExtractionInput = {
            filePath,
            storageKey,
            extension,
        };

        await this.validateFileContent(input);

        return extractor.extract(input);
    }

    private async readFileSample(
        filePath: string,
        storageKey: string,
    ): Promise<Buffer> {
        try {
            const fileHandle = await open(filePath, 'r');

            try {
                const sample = Buffer.alloc(FILE_SIGNATURE_SAMPLE_SIZE);
                const { bytesRead } = await fileHandle.read(
                    sample,
                    0,
                    sample.length,
                    0,
                );

                return sample.subarray(0, bytesRead);
            } finally {
                await fileHandle.close();
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new UnrecoverableError(
                    `RAG 원본 파일을 찾을 수 없습니다: storageKey=${storageKey}`,
                );
            }

            throw error;
        }
    }

    private validatePdfSignature(sample: Buffer): void {
        const signature = sample.subarray(0, PDF_SIGNATURE.length);

        if (!signature.equals(PDF_SIGNATURE)) {
            throw new UnrecoverableError(
                '확장자는 .pdf이지만 실제 파일 내용이 PDF 형식이 아닙니다.',
            );
        }
    }

    private validateTextContent(sample: Buffer): void {
        if (sample.length === 0) {
            throw new UnrecoverableError('RAG 문서가 비어 있습니다.');
        }

        if (sample.includes(0)) {
            throw new UnrecoverableError(
                '확장자는 .txt이지만 바이너리 파일로 판단되어 처리할 수 없습니다.',
            );
        }

        const signature = sample.subarray(0, PDF_SIGNATURE.length);

        if (signature.equals(PDF_SIGNATURE)) {
            throw new UnrecoverableError(
                '실제 PDF 파일을 .txt 확장자로 업로드할 수 없습니다.',
            );
        }
    }

    private async validateFileContent(
        input: RagDocumentExtractionInput,
    ): Promise<void> {
        const sample = await this.readFileSample(
            input.filePath,
            input.storageKey,
        );

        if (input.extension === '.pdf') {
            this.validatePdfSignature(sample);
            return;
        }

        if (input.extension === '.txt') {
            this.validateTextContent(sample);
        }
    }
}