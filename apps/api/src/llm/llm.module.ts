import { Module } from '@nestjs/common';
import { LlmModelFactory } from './llm-model.factory';

@Module({
    providers: [LlmModelFactory],
    exports: [LlmModelFactory],
})
export class LlmModule {}