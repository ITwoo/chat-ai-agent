import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { UserMemory } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChatMessageRole } from '@repo/shared';
import { AgentGraph, AgentGraphFactory } from './agent-graph.factory';
import { AgentToolsService } from './agent-tools.service';
import { AgentApprovalDecision, AgentApprovalRequest, agentApprovalRequestSchema, ApprovalIntent, approvalIntentSchema } from './agent-interrupt.schema';
import { Command } from '@langchain/langgraph';
import { RagCitation, ragCitationSchema } from '../rag/schemas/rag-citation.schema';
import { ChatAgentContext } from '../chat/chat.service';
import { UserMemoryService } from '../user-memory/user-memory.service';
import { RelevantUserMemory } from '../user-memory/user-memory.types';
import { RunnableConfig } from '@langchain/core/runnables';
import { AGENT_CONTEXT_VERSION, AgentContextBuilderService } from './agent-context-builder.service';
import { AgentMcpToolsService } from './agent-mcp-tools.service';


export type AgentStreamEvent =
    | {
        type: 'text_delta';
        delta: string;
    }
    | { type: 'completed'; ragCitations: RagCitation[] }
    | {
        type: 'approval_required';
        threadId: string;
        request: AgentApprovalRequest;
    };

type AgentGraphStreamInput = Parameters<AgentGraph['streamEvents']>[0];

type AgentRunKind =
    | 'generate'
    | 'stream'
    | 'resume'
    | 'retry';

export type AgentRunContext = {
    agentThreadId: string;
    conversationThreadId: string;
    roomId: number;
    userMessageId: number;
};

export type ApprovalIntentTraceContext = {
    userId: number;
    roomId: number;
    approvalId: string;
    agentThreadId: string;
    conversationThreadId: string;
    originUserMessageId: number;
    responseMessageId: number;
};

const AGENT_TRACE_TAG = 'chat-agent';
const APPROVAL_INTENT_PROMPT_VERSION = 'approval-intent-v1';

const APPROVAL_INTENT_SYSTEM_PROMPT = `
너는 AI Agent의 승인 요청에 대한 사용자 응답을 분류하는 전용 분류기다.

현재 승인 요청과 사용자의 답변을 읽고 반드시 다음 네 가지 중 하나로만 분류한다.

- approve:
  사용자가 현재 제안된 내용을 그대로 실행하라고 명확히 허용한다.

- cancel:
  사용자가 현재 제안을 거절하거나 작업을 중단하라고 한다.

- revise:
  사용자가 현재 제안을 그대로 승인하지 않고 실행 대상이나 변경 내용을 새롭게 제시한다.

- unclear:
  승인, 취소, 변경 중 어느 의도인지 명확하지 않거나 질문, 감탄, 관계없는 말을 한다.

판단 기준:

- approvalRequest에 포함된 현재 제안과 사용자 답변을 반드시 비교한다.
- "승인", "승인해", "진행해", "그대로 해"는 approve다.
- approvalRequest.type이 "expense_update_approval"인 경우
  "수정해", "수정해줘", "그대로 수정해줘"는 approve다.
- approvalRequest.type이 "schedule_delete_approval"인 경우
  일정을 삭제하겠다는 의도가 명확하면 approve다.
- approvalRequest.type이 "expense_delete_approval"인 경우
  지출 삭제를 명확하게 허용해야 approve다.
- approvalRequest.type이 "user_memory_delete_approval"인 경우
  삭제를 명확하게 허용해야 approve다.
- 메모리 삭제 승인에서 "수정해", "내용을 바꿔", "다르게 저장해"처럼
  삭제가 아닌 변경을 요청하면 revise다.
- 사용자가 현재 제안과 같은 값을 다시 말하면서 실행을 요청해도 approve다.
- 현재 제안과 다른 값을 제시하거나 새로운 변경 항목을 추가하면 revise다.
- 기존 변경 항목을 제외하거나 수정 대상을 바꾸려는 경우에도 revise다.
- "취소", "하지 마", "수정하지 마", "아니야"는 cancel이다.
- "정말 맞아?", "잠깐", "음..."처럼 의도가 불명확하면 unclear다.

비교 예시:

- 현재 제안 금액이 9,500원이고 "9,500원으로 수정해"라고 하면 approve다.
- 현재 제안 금액이 9,500원이고 "10,000원으로 수정해"라고 하면 revise다.
- 현재 제안이 금액 변경뿐인데 "제목도 점심으로 바꿔"라고 하면 revise다.
- 현재 제안이 장기 메모리 삭제이고 "삭제해"라고 하면 approve다.
- 현재 제안이 장기 메모리 삭제이고 "수정해"라고 하면 revise다.
`;

@Injectable()
export class AgentService {
    private readonly logger = new Logger(AgentService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly agentToolsService: AgentToolsService,
        private readonly agentMcpToolsService: AgentMcpToolsService,
        private readonly agentGraphFactory: AgentGraphFactory,
        private readonly userMemoryService: UserMemoryService,
        private readonly agentContextBuilderService: AgentContextBuilderService,
    ) { }

    private createModel(): ChatOpenAI {
        return new ChatOpenAI({
            apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
            model: this.configService.getOrThrow<string>('OPENAI_MODEL'),
        })
    }

    async classifyApprovalIntent(
        request: AgentApprovalRequest,
        content: string,
        traceContext: ApprovalIntentTraceContext,
    ): Promise<ApprovalIntent> {
        const normalizedContent = content.trim();

        if (!normalizedContent) {
            return {
                intent: 'unclear',
            };
        }

        const classifier = this.createModel().withStructuredOutput(
            approvalIntentSchema,
            {
                name: 'classify_agent_approval_intent',
            },
        );

        return classifier.invoke([
            new SystemMessage(APPROVAL_INTENT_SYSTEM_PROMPT),
            new HumanMessage(JSON.stringify({
                approvalRequest: request,
                userResponse: normalizedContent,
            })),
        ],
            this.createApprovalIntentTraceConfig(traceContext),
        );
    }

    private createRunConfig(
        userId: number,
        runContext: AgentRunContext,
        runKind: AgentRunKind,
    ): RunnableConfig {
        return {
            runName: `chat_agent_${runKind}`,
            tags: [AGENT_TRACE_TAG, runKind],
            metadata: {
                thread_id: runContext.conversationThreadId,
                agent_thread_id: runContext.agentThreadId,
                user_id: String(userId),
                room_id: String(runContext.roomId),
                user_message_id: String(runContext.userMessageId),
                run_kind: runKind,
                workload: 'chat_agent',
                execution_mode: 'interactive',
                context_version: AGENT_CONTEXT_VERSION,
            },
            configurable: {
                thread_id: runContext.agentThreadId,
            },
        };
    }

    private createApprovalIntentTraceConfig(
        context: ApprovalIntentTraceContext,
    ): RunnableConfig {
        return {
            runName: 'approval_intent_classification',
            tags: [AGENT_TRACE_TAG, 'approval-classifier'],
            metadata: {
                thread_id: context.conversationThreadId,
                agent_thread_id: context.agentThreadId,
                user_id: String(context.userId),
                room_id: String(context.roomId),
                approval_id: context.approvalId,
                origin_user_message_id: String(context.originUserMessageId),
                response_message_id: String(context.responseMessageId),
                workload: 'approval_intent',
                execution_mode: 'interactive',
                llm_operation: 'approval_intent_classification',
                prompt_version: APPROVAL_INTENT_PROMPT_VERSION,
            },
        };
    }

    private async createGraphForUser(userId: number): Promise<AgentGraph> {
        const context = {
            userId,
        }

        const agentTools = this.agentToolsService.getTools(context);
        const mcpTools = await this.agentMcpToolsService.getTools();
        const tools = [...agentTools, ...mcpTools];

        const model = this.createModel();

        return this.agentGraphFactory.createGraph(
            model,
            tools,
            context,
        );
    }

    async hasPendingInterrupt(
        userId: number,
        agentThreadId: string,
    ): Promise<boolean> {
        const graph = await this.createGraphForUser(userId);

        const state = await graph.getState({
            configurable: {
                thread_id: agentThreadId,
            },
        });

        return state.tasks.some((task) => {
            return task.interrupts.length > 0;
        });
    }

    async generateReply(
        userId: number,
        context: ChatAgentContext,
        runContext: AgentRunContext,
    ): Promise<string> {
        const graph = await this.createGraphForUser(userId)
        const userMemories = await this.getUserMemoriesSafely(userId, context);
        const langchainMessages = await this.agentContextBuilderService.build(
            context,
            userMemories,
        );

        const result = await graph.invoke(
            {
                messages: langchainMessages,
            },
            this.createRunConfig(userId, runContext, 'generate'),
        );

        const lastMessage = result.messages.at(-1);

        if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
            throw new Error('AI 응답을 생성하지 못했습니다.')
        }

        return this.messageContentToString(lastMessage.content)
    }

    async *streamReply(
        userId: number,
        context: ChatAgentContext,
        runContext: AgentRunContext,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {
        const userMemories = await this.getUserMemoriesSafely(userId, context);
        const langchainMessages = await this.agentContextBuilderService.build(
            context,
            userMemories,
        );

        yield* this.streamGraph(
            userId,
            {
                messages: langchainMessages,
            },
            runContext,
            'stream',
            signal,
        );
    }

    async *resumeReply(
        userId: number,
        runContext: AgentRunContext,
        decision: AgentApprovalDecision,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {
        yield* this.streamGraph(
            userId,
            new Command({
                resume: decision,
            }),
            runContext,
            'resume',
            signal,
        );
    }

    async *retryReply(
        userId: number,
        runContext: AgentRunContext,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {
        const graph = await this.createGraphForUser(userId);

        const config = this.createRunConfig(
            userId,
            runContext,
            'retry',
        );

        const state = await graph.getState(config);

        const hasPendingInterrupt = state.tasks.some(
            (task) => task.interrupts.length > 0,
        );

        if (hasPendingInterrupt) {
            throw new Error(
                '승인 대기 중인 실행은 메시지 재시도로 처리할 수 없습니다.',
            );
        }

        if (state.next.length > 0) {
            yield* this.streamGraph(
                userId,
                null,
                runContext,
                'retry',
                signal,
            );

            return;
        }

        const lastMessage = state.values.messages.at(-1);

        if (
            !lastMessage ||
            !AIMessage.isInstance(lastMessage)
        ) {
            throw new Error(
                '복구할 AI 응답을 찾을 수 없습니다.',
            );
        }

        const content =
            this.messageContentToString(lastMessage.content);

        if (!content.trim()) {
            throw new Error(
                '복구할 AI 응답이 비어 있습니다.',
            );
        }

        yield {
            type: 'text_delta',
            delta: content,
        };

        yield {
            type: 'completed',
            ragCitations: ragCitationSchema.array().parse(
                state.values.ragCitations,
            ),
        };
    }

    private async *streamGraph(
        userId: number,
        input: AgentGraphStreamInput,
        runContext: AgentRunContext,
        runKind: AgentRunKind,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentStreamEvent> {
        const graph = await this.createGraphForUser(userId);

        const stream = await graph.streamEvents(
            input,
            {
                ...this.createRunConfig(userId, runContext, runKind),
                version: 'v3',
                signal,
            },
        );

        for await (const message of stream.messages) {
            for await (const delta of message.text) {
                if (!delta) {
                    continue;
                }

                yield {
                    type: 'text_delta',
                    delta,
                };
            }
        }

        if (stream.interrupted) {
            if (stream.interrupts.length !== 1) {
                throw new Error('현재 여러 승인 요청의 동시 처리는 지원하지 않습니다.');
            }

            const result = agentApprovalRequestSchema.safeParse(stream.interrupts[0]?.payload);

            if (!result.success) {
                throw new Error('지원하지 않는 승인 요청 형식입니다.');
            }

            yield { type: 'approval_required', threadId: runContext.agentThreadId, request: result.data };
            return;
        }

        const output = await stream.output;

        yield {
            type: 'completed',
            ragCitations: ragCitationSchema.array().parse(output.ragCitations),
        };
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

    private async getUserMemoriesSafely(
        userId: number,
        context: ChatAgentContext,
    ): Promise<RelevantUserMemory[]> {
        const query = this.getLatestUserMessageContent(context);
        if (!query) return [];

        try {
            return await this.userMemoryService.searchRelevantMemories(userId, query);
        } catch (error) {
            this.logger.error(
                `관련 사용자 장기 메모리 조회 실패: userId=${userId}`,
                error instanceof Error ? error.stack : String(error),
            );

            return [];
        }
    }

    private getLatestUserMessageContent(context: ChatAgentContext): string {
        for (let index = context.messages.length - 1; index >= 0; index--) {
            const message = context.messages[index];

            if (message?.role === ChatMessageRole.USER) return message.content.trim();
        }

        return '';
    }

}
