import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolCallingChatModel } from './llm-model.type';
import { ChatGoogle } from '@langchain/google';
import { ChatAnthropic } from '@langchain/anthropic';

@Injectable()
export class LlmModelFactory {
    constructor(
        private readonly configService: ConfigService,
    ) { }

    createModel(): ToolCallingChatModel {
        const provider =
            this.configService.get<string>('LLM_PROVIDER') ?? 'openai';

        switch (provider) {
            case 'openai':
                return this.createOpenAiModel();

            case 'google':
                return this.createGoogleModel();

            case 'anthropic':
                return this.createAnthropicModel();

            default:
                throw new Error(
                    `지원하지 않는 LLM_PROVIDER입니다: ${provider}`,
                );
        }
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

}