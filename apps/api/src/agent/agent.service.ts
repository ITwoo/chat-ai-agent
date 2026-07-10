import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatMessage } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChatMessageRole } from '@repo/shared';
import { AgentGraph, AgentGraphFactory } from './agent-graph.factory';
import { AgentToolsService } from './agent-tools.service';


@Injectable()
export class AgentService {

    constructor(
        private readonly configService: ConfigService,
        private readonly agentToolsService: AgentToolsService,
        private readonly agentGraphFactory: AgentGraphFactory,
    ) {}

    private createGraphForUser(userId: number): AgentGraph {
        const tools = this.agentToolsService.getTools({
            userId,
        });

        const model = new ChatOpenAI({
            apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
            model: this.configService.getOrThrow<string>('OPENAI_MODEL'),
            //temperature:0.7,
        }).bindTools(tools);

        return this.agentGraphFactory.createGraph(model, tools);
    }

    async generateReply(userId: number, messages: ChatMessage[]): Promise<string> {
        const graph = this.createGraphForUser(userId)
        const langchainMessages = this.toLangChainMessages(messages);

        const result = await graph.invoke({
            messages: langchainMessages,
        });

        const lastMessage = result.messages.at(-1);

        if(!lastMessage || !AIMessage.isInstance(lastMessage)) {
            throw new Error('AI 응답을 생성하지 못했습니다.')
        }

        return this.messageContentToString(lastMessage.content)
    }

    async *streamReply(userId: number, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
        const graph = this.createGraphForUser(userId);
        const langchainMessages = this.toLangChainMessages(messages);

        const stream = await graph.stream(
            {
                messages: langchainMessages,
            },
            {
                streamMode: 'messages',
                signal,
            }
        );

        for await (const [messageChunk, metadata] of stream) {
            if(metadata.langgraph_node !== 'callModel') {
                continue;
            }

            const text = this.messageContentToString(messageChunk.content);

            if(text) {
                yield text;
            }
        }
    }

    private toLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
        return messages.map((message) => {
            if (message.role === ChatMessageRole.USER) {
                return new HumanMessage(message.content);
            }

            if (message.role === ChatMessageRole.ASSISTANT) {
                return new AIMessage(message.content);
            }

            return new SystemMessage(message.content);
        });
    }

    private messageContentToString(content: AIMessage['content']): string {
        if (typeof content === 'string') {
            return content;
        }

        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part;
                }

                if (
                    typeof part === 'object' &&
                    part !== null &&
                    'text' in part &&
                    typeof part.text === 'string'
                ) {
                    return part.text;
                }

                return '';
            })
            .join('');
    }

}
