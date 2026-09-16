import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmModelFactory {
    constructor(
        private readonly configService: ConfigService,
    ) { }

    createModel(): ChatOpenAI {
        return new ChatOpenAI({
            apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
            model: this.configService.getOrThrow<string>('OPENAI_MODEL'),
            reasoning: {
                effort: 'low',
            },
        });
    }
}