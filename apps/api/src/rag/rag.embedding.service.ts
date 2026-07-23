import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
    RAG_EMBEDDING_DIMENSIONS,
    RAG_EMBEDDING_MODEL,
} from './rag.constants';
import type { RagEmbeddingResult } from './rag.types';

@Injectable()
export class RagEmbeddingService {
    private readonly openai: OpenAI;

    constructor(configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: configService.getOrThrow<string>('OPENAI_API_KEY'),
        });
    }

    async embedText(text: string): Promise<RagEmbeddingResult> {
        const normalizedText = text.trim();

        if (!normalizedText) {
            throw new BadRequestException(
                '임베딩할 텍스트가 비어 있습니다.',
            );
        }

        const response = await this.openai.embeddings.create({
            model: RAG_EMBEDDING_MODEL,
            input: normalizedText,
            dimensions: RAG_EMBEDDING_DIMENSIONS,
            encoding_format: 'float',
        });

        const embedding = response.data[0]?.embedding;

        if (!embedding) {
            throw new Error('OpenAI가 임베딩 결과를 반환하지 않았습니다.');
        }

        if (embedding.length !== RAG_EMBEDDING_DIMENSIONS) {
            throw new Error(
                `임베딩 차원이 일치하지 않습니다: expected=${RAG_EMBEDDING_DIMENSIONS}, actual=${embedding.length}`,
            );
        }

        return {
            embedding,
            tokenCount: response.usage.total_tokens,
        };
    }
}