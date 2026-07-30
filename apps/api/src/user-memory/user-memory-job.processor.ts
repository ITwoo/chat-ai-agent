import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
    UnrecoverableError,
    type Job,
} from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
    USER_MEMORY_JOB_NAME,
    USER_MEMORY_QUEUE,
} from '../queue/queue.constants';
import type {
    UserMemoryExtractionJobData,
    UserMemoryExtractionJobResult,
} from '../queue/queue.types';
import { UserMemoryExtractionService } from './user-memory-extraction.service';

@Injectable()
@Processor(USER_MEMORY_QUEUE)
export class UserMemoryJobProcessor extends WorkerHost {
    private readonly logger = new Logger(
        UserMemoryJobProcessor.name,
    );

    constructor(
        private readonly prisma: PrismaService,
        private readonly userMemoryExtractionService: UserMemoryExtractionService,
    ) {
        super();
    }

    async process(
        job: Job<
            UserMemoryExtractionJobData,
            UserMemoryExtractionJobResult
        >,
    ): Promise<UserMemoryExtractionJobResult> {
        if (job.name !== USER_MEMORY_JOB_NAME.EXTRACT) {
            throw new UnrecoverableError(
                `지원하지 않는 사용자 메모리 Job입니다: ${job.name}`,
            );
        }

        const { userId, messageId } = job.data;

        const message =
            await this.prisma.chatMessage.findFirst({
                where: {
                    id: messageId,
                    role: 'USER',
                    status: 'COMPLETED',
                    room: {
                        userId,
                    },
                },
                select: {
                    content: true,
                },
            });

        if (!message) {
            throw new UnrecoverableError(
                `메모리 추출 대상 사용자 메시지를 찾을 수 없습니다: userId=${userId}, messageId=${messageId}`,
            );
        }

        const result =
            await this.userMemoryExtractionService.extractAndSave(
                userId,
                messageId,
                message.content,
            );

        this.logger.log(
            `사용자 장기 메모리 추출 완료: jobId=${job.id}, userId=${userId}, messageId=${messageId}, savedCount=${result.savedCount}`,
        );

        return result;
    }
}