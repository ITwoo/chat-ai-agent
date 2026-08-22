import { Injectable } from '@nestjs/common';
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
import { readFile } from 'node:fs/promises';
import { RagFileStorageService } from '../storage/rag-file-storage.service';

const FILE_SIGNATURE_SAMPLE_SIZE = 8 * 1024;
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

@Injectable()
export class RagDocumentExtractorService {
    private readonly extractors: RagDocumentTextExtractor[];

    constructor(
        private readonly ragFileStorageService: RagFileStorageService,
        ragTextFileExtractor: RagTextFileExtractor,
        ragPdfFileExtractor: RagPdfFileExtractor,
    ) {
        this.extractors = [
            ragTextFileExtractor,
            ragPdfFileExtractor,
        ];
    }

    async extract(storageKey: string): Promise<RagDocumentExtractionResult> {        
        const extension = extname(storageKey).toLowerCase();
        const extractor = this.extractors.find((candidate) =>
            candidate.supports(extension),
        );

        if (!extractor) {
            throw new UnrecoverableError(
                `지원하지 않는 RAG 문서 형식입니다: extension=${extension || '없음'}`,
            );
        }

        const data = await this.ragFileStorageService.read(storageKey);

        if (!data) {
            throw new UnrecoverableError(
                `RAG 원본 파일을 찾을 수 없습니다: storageKey=${storageKey}`,
            );
        }

        const input: RagDocumentExtractionInput = { data, storageKey, extension };

        this.validateFileContent(input);

        return extractor.extract(input);
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

    private validateFileContent(input: RagDocumentExtractionInput): void {
        const sample = input.data.subarray(0, FILE_SIGNATURE_SAMPLE_SIZE);

        if (input.extension === '.pdf') {
            this.validatePdfSignature(sample);
            return;
        }

        if (input.extension === '.txt') {
            this.validateTextContent(sample);
        }
    }
}