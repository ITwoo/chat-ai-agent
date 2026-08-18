import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AIMessage,
    type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { RagSearchResult } from './rag.types';
import { createRagAnswerMessages } from './security/rag-answer-messages.factory';
import { RunnableConfig } from '@langchain/core/runnables';
import { RAG_ANSWER_PROMPT_VERSION } from './security/rag-security.constants';

const RAG_ANSWER_CONTEXT_TOKEN_BUDGET = 3_000;
const UNKNOWN_CHUNK_TOKEN_COST = 1_000;

const RAG_ANSWER_TIMEOUT_MS = 45_000;

@Injectable()
export class RagAnswerService {
    private readonly model: ChatOpenAI;

    constructor(configService: ConfigService) {
        this.model = new ChatOpenAI({
            apiKey:
                configService.getOrThrow<string>(
                    'OPENAI_API_KEY',
                ),
            model:
                configService.getOrThrow<string>(
                    'OPENAI_MODEL',
                ),
            maxRetries: 2,
        });
    }

    selectContextResults(results: RagSearchResult[]): RagSearchResult[] {
        const selectedResults: RagSearchResult[] = [];
        let usedTokenCount = 0;

        for (const result of results) {
            const tokenCount = result.tokenCount ?? UNKNOWN_CHUNK_TOKEN_COST;
            const exceedsBudget = ( usedTokenCount + tokenCount ) > RAG_ANSWER_CONTEXT_TOKEN_BUDGET;

            if (selectedResults.length > 0 && exceedsBudget) continue;

            selectedResults.push(result);
            usedTokenCount += tokenCount;

            if (usedTokenCount >= RAG_ANSWER_CONTEXT_TOKEN_BUDGET) break;
        }

        return selectedResults;
    }

    async answer(
        question: string,
        results: RagSearchResult[],
        config?: RunnableConfig,
    ): Promise<BaseMessage> {
        if (results.length === 0) {
            return new AIMessage(
                '업로드된 문서에서 질문과 관련된 근거를 찾지 못했습니다.',
            );
        }

        const messages = createRagAnswerMessages(
            question,
            results,
        );

        return this.model.invoke(messages, {
            ...config,
            runName: 'rag_answer_generation',
            tags: [...(config?.tags ?? []), 'rag-answer'],
             metadata: {
                ...config?.metadata,
                llm_operation: 'rag_answer_generation',
                prompt_version: RAG_ANSWER_PROMPT_VERSION,
            },
            timeout: RAG_ANSWER_TIMEOUT_MS,
        });
    }
}