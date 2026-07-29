import { Injectable, Logger } from '@nestjs/common';
import {
    type StructuredToolInterface,
    tool,
} from '@langchain/core/tools';
import { z } from 'zod';
import { UserMemoryService } from './user-memory.service';

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
                    await this.userMemoryService.searchActiveMemories(
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
                    '사용자가 저장된 장기 메모리를 확인하거나 특정 기억을 찾으려 할 때 활성 메모리를 검색한다. 메모리 삭제 전에 삭제할 후보 ID를 확인할 때도 사용한다.',
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
}