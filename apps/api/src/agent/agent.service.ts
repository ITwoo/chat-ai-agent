import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatMessage } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChatMessageRole } from '@repo/shared';
import { AgentGraph, AgentGraphFactory } from './agent-graph.factory';
import { AgentToolsService } from './agent-tools.service';
import { ExpenseUpdateApprovalRequest, expenseUpdateApprovalRequestSchema, UpdateExpenseDecision } from './agent-interrupt.schema';
import { Command } from '@langchain/langgraph';

export type AgentStreamEvent =
    | {
          type: 'text_delta';
          delta: string;
      }
    | {
          type: 'approval_required';
          threadId: string;
          request: ExpenseUpdateApprovalRequest;
      };

type AgentGraphStreamInput = Parameters<AgentGraph['streamEvents']>[0];

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

    async generateReply(
        userId: number,
        messages: ChatMessage[],
        threadId: string,
    ): Promise<string> {
        const graph = this.createGraphForUser(userId)
        const langchainMessages = this.toLangChainMessages(messages);

        const result = await graph.invoke(
            {
                messages: langchainMessages,
            },
            {
                configurable: {
                    thread_id: threadId,
                },
            },
        );

        const lastMessage = result.messages.at(-1);

        if(!lastMessage || !AIMessage.isInstance(lastMessage)) {
            throw new Error('AI 응답을 생성하지 못했습니다.')
        }

        return this.messageContentToString(lastMessage.content)
    }

    async *streamReply(
        userId: number,
        messages: ChatMessage[],
        threadId: string,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {        
        const langchainMessages = this.toLangChainMessages(messages);

        yield* this.streamGraph(
            userId,
            {
                messages: langchainMessages,
            },
            threadId,
            signal,
        );
    }

    async *resumeReply(
        userId: number,
        threadId: string,
        decision: UpdateExpenseDecision,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {
        yield* this.streamGraph(
            userId,
            new Command({
                resume: decision,
            }),
            threadId,
            signal,
        );
    }

    private async *streamGraph(
        userId: number,
        input: AgentGraphStreamInput,
        threadId: string,
        signal?: AbortSignal,
    ) : AsyncGenerator<AgentStreamEvent> {
        const graph = this.createGraphForUser(userId);

        const stream = await graph.streamEvents(
            input,
            {
                version: 'v3',
                configurable: {
                    thread_id: threadId,
                },
                signal,
            },
        );

        for await (const message of stream.messages) {
            for await (const delta of message.text) {
                if(!delta) {
                    continue;
                }

                yield {
                    type: 'text_delta',
                    delta,
                };
            }
        }

        if(!stream.interrupted) {
            return;
        }

        if(stream.interrupts.length !== 1) {
            throw new Error('현재 여러 승인 요청의 동시 처리는 지원하지 않습니다.');
        }

        const interruptValue = stream.interrupts[0]?.payload;

        const approvalRequestResult = expenseUpdateApprovalRequestSchema.safeParse(interruptValue);

        if(!approvalRequestResult.success) {
            throw new Error('지원하지 않는 승인 요청 형식입니다.');
        }

        yield {
            type: 'approval_required',
            threadId,
            request: approvalRequestResult.data,
        };
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
