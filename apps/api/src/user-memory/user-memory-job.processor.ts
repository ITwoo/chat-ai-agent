import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
    UnrecoverableError,
    type Job,
} from 'bullmq';
import {
    USER_MEMORY_JOB_NAME,
    USER_MEMORY_QUEUE,
} from '../queue/queue.constants';
import type {
    UserMemoryExtractionJobData,
    UserMemoryExtractionJobResult,
} from '../queue/queue.types';
import { UserMemoryExtractionService } from './user-memory-extraction.service';
import { UserMemoryJobStateService } from './user-memory-job-state.service';

const EMPTY_EXTRACTION_RESULT: UserMemoryExtractionJobResult = {
    extractedCount: 0,
    savedCount: 0,
    archivedCount: 0,
    skippedCount: 0,
};

@Injectable()
@Processor(USER_MEMORY_QUEUE)
export class UserMemoryJobProcessor extends WorkerHost {
    private readonly logger = new Logger(
        UserMemoryJobProcessor.name,
    );

    constructor(
        private readonly userMemoryExtractionService:
            UserMemoryExtractionService,
        private readonly userMemoryJobStateService:
            UserMemoryJobStateService,
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

        const claim =
            await this.userMemoryJobStateService.claimForProcessing(
                userId,
                messageId,
            );

        if (claim === 'ALREADY_COMPLETED') {
            this.logger.warn(
                `이미 완료된 사용자 메모리 추출 Job을 건너뜁니다: jobId=${job.id}, userId=${userId}, messageId=${messageId}`,
            );

            await job.updateProgress(100);
            return EMPTY_EXTRACTION_RESULT;
        }

        if (claim === 'ALREADY_PROCESSING') {
            this.logger.warn(
                `이미 처리 중인 사용자 메모리 추출 Job을 건너뜁니다: jobId=${job.id}, userId=${userId}, messageId=${messageId}`,
            );

            return EMPTY_EXTRACTION_RESULT;
        }

        if (claim === 'NOT_FOUND') {
            throw new UnrecoverableError(
                `메모리 추출 대상 메시지를 찾을 수 없습니다: userId=${userId}, messageId=${messageId}`,
            );
        }

        if (claim === 'INVALID_STATE') {
            throw new UnrecoverableError(
                `메모리 추출 대상 메시지 상태가 올바르지 않습니다: userId=${userId}, messageId=${messageId}`,
            );
        }

        try {
            const message =
                await this.getSourceMessage(
                    userId,
                    messageId,
                );

            const result =
                await this.userMemoryExtractionService.extractAndSave(
                    userId,
                    messageId,
                    message.content,
                );

            await this.userMemoryJobStateService.markCompleted(
                userId,
                messageId,
            );

            await job.updateProgress(100);

            this.logger.log(
                `사용자 장기 메모리 추출 완료: jobId=${job.id}, userId=${userId}, messageId=${messageId}, savedCount=${result.savedCount}`,
            );

            return result;
        } catch (error) {
            this.logger.error(error)
            const normalizedError =
                error instanceof Error
                    ? error
                    : new Error(String(error));

            await this.handleProcessingFailure(
                job,
                normalizedError,
            );

            throw normalizedError;
        }
    }

    private async getSourceMessage(
        userId: number,
        messageId: number,
    ): Promise<{ content: string }> {
        const message =
            await this.userMemoryExtractionService.getSourceMessage(
                userId,
                messageId,
            );

        if (!message) {
            throw new UnrecoverableError(
                `메모리 추출 대상 사용자 메시지를 찾을 수 없습니다: userId=${userId}, messageId=${messageId}`,
            );
        }

        return message;
    }

    private async handleProcessingFailure(
        job: Job<
            UserMemoryExtractionJobData,
            UserMemoryExtractionJobResult
        >,
        error: Error,
    ): Promise<void> {
        const { userId, messageId } = job.data;

        const maxAttempts = job.opts.attempts ?? 1;
        const currentAttempt = job.attemptsMade + 1;
        const isUnrecoverable =
            error instanceof UnrecoverableError;

        const willRetry =
            !isUnrecoverable &&
            currentAttempt < maxAttempts;

        const errorMessage = willRetry
            ? `메모리 추출 실패, 재시도 예정 (${currentAttempt}/${maxAttempts}): ${error.message}`
            : error.message;

        try {
            const updated =
                await this.userMemoryJobStateService.markFailed(
                    userId,
                    messageId,
                    errorMessage,
                    willRetry,
                );

            if (!updated) {
                this.logger.warn(
                    `사용자 메모리 실패 상태가 변경되지 않았습니다: userId=${userId}, messageId=${messageId}`,
                );
            }
        } catch (stateError) {
            this.logger.error(
                `사용자 메모리 실패 상태 저장 오류: userId=${userId}, messageId=${messageId}`,
                stateError instanceof Error
                    ? stateError.stack
                    : String(stateError),
            );
        }

        const logMessage =
            `사용자 메모리 추출 실패: jobId=${job.id}, userId=${userId}, messageId=${messageId}, ` +
            `attempt=${currentAttempt}/${maxAttempts}, willRetry=${willRetry}, error=${error.message}`;

        if (willRetry) {
            this.logger.warn(logMessage);
        } else {
            this.logger.error(logMessage);
        }
    }
}