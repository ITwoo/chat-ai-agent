import { ChatGoogle } from '@langchain/google';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { LlmModelFactory } from './llm-model.factory';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('LlmModelFactory', () => {
    const createConfigService = (
        values: Record<string, string>,
    ): ConfigService => {
        return {
            get: jest.fn((key: string) => values[key]),
            getOrThrow: jest.fn((key: string) => {
                const value = values[key];

                if (value === undefined) {
                    throw new Error(
                        `환경변수가 없습니다: ${key}`,
                    );
                }

                return value;
            }),
        } as unknown as ConfigService;
    };

    it('provider가 없으면 OpenAI 모델을 생성한다', () => {
        const configService = createConfigService({
            OPENAI_API_KEY: 'test-openai-key',
            OPENAI_MODEL: 'test-openai-model',
        });

        const factory = new LlmModelFactory(
            configService,
        );

        const model = factory.createModel();

        expect(model).toBeInstanceOf(ChatOpenAI);
    });

    it('google provider이면 Gemini 모델을 생성한다', () => {
        const configService = createConfigService({
            LLM_PROVIDER: 'google',
            GOOGLE_API_KEY: 'test-google-key',
            GOOGLE_MODEL: 'gemini-2.5-flash',
        });

        const factory = new LlmModelFactory(
            configService,
        );

        const model = factory.createModel();

        expect(model).toBeInstanceOf(ChatGoogle);
    });

    it('지원하지 않는 provider이면 예외가 발생한다', () => {
        const configService = createConfigService({
            LLM_PROVIDER: 'unknown',
        });

        const factory = new LlmModelFactory(
            configService,
        );

        expect(() => factory.createModel()).toThrow(
            '지원하지 않는 LLM_PROVIDER입니다: unknown',
        );
    });
});