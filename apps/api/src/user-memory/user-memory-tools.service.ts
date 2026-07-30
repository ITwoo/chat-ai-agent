import { Injectable, Logger } from '@nestjs/common';
import {
    type StructuredToolInterface,
    tool,
} from '@langchain/core/tools';
import { z } from 'zod';
import { UserMemoryService } from './user-memory.service';
import { agentApprovalDecisionSchema, UserMemoryDeleteApprovalRequest } from '../agent/agent-interrupt.schema';
import { interrupt } from '@langchain/langgraph';

type UserMemoryToolContext = {
    userId: number;
};

const userMemoryTypeSchema = z.enum([
    'PROFILE',
    'PREFERENCE',
    'GOAL',
    'CONSTRAINT',
]);

@Injectable()
export class UserMemoryToolsService {
    private readonly logger = new Logger(
        UserMemoryToolsService.name,
    );

    constructor(
        private readonly userMemoryService: UserMemoryService,
    ) {}

    getTools(
        context: UserMemoryToolContext,
    ): StructuredToolInterface[] {
        return [
            this.createSearchUserMemoriesTool(context),
            this.createDeleteUserMemoryTool(context),
        ];
    }

    private createSearchUserMemoriesTool(
        context: UserMemoryToolContext,
    ): StructuredToolInterface {
        return tool(
            async ({ query, type, limit }) => {
                this.logger.log(
                    `[tool] search_user_memories userId=${context.userId}`,
                );

                const memories =
                    await this.userMemoryService.searchMemoriesForTool(
                        context.userId,
                        {
                            query,
                            type,
                            limit,
                        },
                    );

                return JSON.stringify({
                    count: memories.length,
                    memories: memories.map((memory) => ({
                        id: memory.id,
                        type: memory.type,
                        memoryKey: memory.memoryKey,
                        content: memory.content,
                        updatedAt:
                            memory.updatedAt.toISOString(),
                    })),
                });
            },
            {
                name: 'search_user_memories',
                description:
                    '저장된 장기 메모리를 조회한다. query가 있으면 의미가 관련된 메모리를 검색하고, query가 없으면 최근 활성 메모리를 조회한다.',
                schema: z.object({
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .optional()
                        .describe(
                            '찾을 메모리의 핵심 단어나 문장. 예: TypeScript, 아침 식사, 취업 목표',
                        ),
                    type: userMemoryTypeSchema
                        .optional()
                        .describe(
                            '선택 메모리 타입 필터',
                        ),
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(20)
                        .optional()
                        .describe(
                            '최대 조회 개수. 기본값 10, 최대 20',
                        ),
                }),
            },
        );
    }

    private createDeleteUserMemoryTool(
        context: UserMemoryToolContext,
    ): StructuredToolInterface {
        return tool(
            async ({ memoryId }) => {
                this.logger.log(
                    `[tool] delete_user_memory userId=${context.userId}, memoryId=${memoryId}`,
                );

                const memory =
                    await this.userMemoryService.getActiveMemoryById(
                        context.userId,
                        memoryId,
                    );

                const approvalRequest = {
                    type: 'user_memory_delete_approval',
                    action: 'delete_user_memory',
                    message: '이 장기 메모리를 삭제할까요?',
                    memory: {
                        id: memory.id,
                        type: memory.type,
                        memoryKey: memory.memoryKey,
                        content: memory.content,
                    },
                } satisfies UserMemoryDeleteApprovalRequest;

                const resumeValue: unknown =
                    interrupt(approvalRequest);

                const decisionResult =
                    agentApprovalDecisionSchema.safeParse(
                        resumeValue,
                    );

                if (!decisionResult.success) {
                    return '메모리 삭제 승인 응답 형식이 올바르지 않습니다.';
                }

                const decision = decisionResult.data;

                if (decision.action === 'cancel') {
                    return JSON.stringify({
                        deleted: false,
                        status: 'cancelled',
                        memoryId,
                        message: '장기 메모리 삭제를 취소했습니다.',
                    });
                }

                if (decision.action === 'revise') {
                    return JSON.stringify({
                        deleted: false,
                        status: 'revision_requested',
                        memory: approvalRequest.memory,
                        revisionRequest: decision.content,
                        nextAction:
                            '사용자의 revisionRequest를 기준으로 search_user_memories를 다시 호출해 정확한 메모리를 찾은 뒤 delete_user_memory를 다시 호출한다.',
                    });
                }

                await this.userMemoryService.deleteActiveMemory(
                    context.userId,
                    memoryId,
                );

                return JSON.stringify({
                    deleted: true,
                    memory: approvalRequest.memory,
                    message: '장기 메모리를 삭제했습니다.',
                });
            },
            {
                name: 'delete_user_memory',
                description:
                    '사용자가 장기 메모리를 잊거나 삭제해달라고 명확히 요청하고 search_user_memories로 정확한 memoryId를 확인한 경우에만 호출한다. 실행 전에 내부 승인 절차를 거친다.',
                schema: z.object({
                    memoryId: z
                        .number()
                        .int()
                        .positive()
                        .describe(
                            'search_user_memories가 반환한 삭제 대상 메모리 ID',
                        ),
                }),
            },
        );
    }

}