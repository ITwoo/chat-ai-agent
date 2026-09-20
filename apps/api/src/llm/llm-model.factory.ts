import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolCallingChatModel } from './llm-model.type';
import { ChatGoogle } from '@langchain/google';
import { ChatAnthropic } from '@langchain/anthropic';
import { isLlmProvider, LlmProvider } from './llm-provider.type';
import { ChatOllama } from '@langchain/ollama';

@Injectable()
export class LlmModelFactory {
    constructor(
        private readonly configService: ConfigService,
    ) { }

    createModel(
        provider?: LlmProvider,
    ): ToolCallingChatModel {
        const selectedProvider =
            provider ?? this.getConfiguredProvider();

        switch (selectedProvider) {
            case 'openai':
                return this.createOpenAiModel();

            case 'google':
                return this.createGoogleModel();

            case 'anthropic':
                return this.createAnthropicModel();

            case 'ollama':
                return this.createOllamaModel();
            default:
                throw new Error(
                    `지원하지 않는 LLM Provider입니다: ${selectedProvider}`,
                );
        }
    }

    private getConfiguredProvider(): LlmProvider {
        const provider =
            this.configService.get<string>('LLM_PROVIDER') ??
            'openai';

        if (!isLlmProvider(provider)) {
            throw new Error(
                `지원하지 않는 LLM_PROVIDER입니다: ${provider}`,
            );
        }

        return provider;
    }

    private createOpenAiModel(): ChatOpenAI {
        return new ChatOpenAI({
            apiKey:
                this.configService.getOrThrow<string>(
                    'OPENAI_API_KEY',
                ),
            model:
                this.configService.getOrThrow<string>(
                    'OPENAI_MODEL',
                ),
            reasoning: {
                effort: 'low',
            },
        });
    }

    private createGoogleModel(): ChatGoogle {
        return new ChatGoogle({
            apiKey:
                this.configService.getOrThrow<string>(
                    'GOOGLE_API_KEY',
                ),
            model:
                this.configService.getOrThrow<string>(
                    'GOOGLE_MODEL',
                ),
        });
    }
 
    private createAnthropicModel(): ChatAnthropic {
        return new ChatAnthropic({
            apiKey:
                this.configService.getOrThrow<string>(
                    'ANTHROPIC_API_KEY',
                ),
            model:
                this.configService.getOrThrow<string>(
                    'ANTHROPIC_MODEL',
                ),
        });
    }

    private createOllamaModel(): ChatOllama {
        return new ChatOllama({
            model:
                this.configService.get<string>(
                    'OLLAMA_MODEL',
                ) ?? 'qwen3.5:4b',
            baseUrl:
                this.configService.get<string>(
                    'OLLAMA_BASE_URL',
                ) ?? 'http://127.0.0.1:11434',
            temperature: 0,
            think: false,
        });
    }
}