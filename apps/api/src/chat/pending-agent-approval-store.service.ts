import { Injectable } from '@nestjs/common';
import type {
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
    PendingAgentApproval,
} from './types/pending-agent-approval.type';
import { expenseUpdateApprovalRequestSchema } from '../agent/agent-interrupt.schema';

@Injectable()
export class PendingAgentApprovalStoreService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async save(
        roomId: number,
        approval: PendingAgentApproval,
    ): Promise<void> {
        await this.prisma.agentPendingApproval.upsert({
            where: {
                roomId,
            },
            create: {
                roomId,
                approvalId: approval.approvalId,
                threadId: approval.threadId,
                originUserMessageId:
                    approval.originUserMessageId,
                request:
                    approval.request as Prisma.InputJsonValue,
            },
            update: {
                approvalId: approval.approvalId,
                threadId: approval.threadId,
                originUserMessageId:
                    approval.originUserMessageId,
                request:
                    approval.request as Prisma.InputJsonValue,
            },
        });
    }

    async deleteByRoomId(
        roomId: number,
    ): Promise<void> {
        await this.prisma.agentPendingApproval.deleteMany({
            where: {
                roomId,
            },
        });
    }

    async findByRoomId(
        roomId: number,
    ): Promise<PendingAgentApproval | null> {
        const storedApproval =
            await this.prisma.agentPendingApproval.findUnique({
                where: {
                    roomId,
                },
            });

        if (!storedApproval) {
            return null;
        }

        const requestResult =
            expenseUpdateApprovalRequestSchema.safeParse(
                storedApproval.request,
            );

        if (!requestResult.success) {
            throw new Error(
                `저장된 승인 요청 데이터가 올바르지 않습니다. roomId=${roomId}`,
            );
        }

        return {
            approvalId: storedApproval.approvalId,
            threadId: storedApproval.threadId,
            originUserMessageId:
                storedApproval.originUserMessageId,
            request: requestResult.data,
        };
    }

}