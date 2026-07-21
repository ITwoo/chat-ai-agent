import { Injectable } from '@nestjs/common';
import type {
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
    PendingAgentApproval,
} from './types/pending-agent-approval.type';

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
}