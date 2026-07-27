import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { RedisLockService } from '../redis/redis-lock.service';
import { RagDocumentService } from './rag-document.service';

const RECOVERY_INTERVAL_MS = 60 * 1000;
const RECOVERY_LOCK_TTL_MS = 5 * 60 * 1000;
const RECOVERY_LOCK_KEY = 'lock:chat-ai-agent:rag-processing-recovery';

@Injectable()
export class RagDocumentRecoveryService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(RagDocumentRecoveryService.name);
    private intervalId?: NodeJS.Timeout;
    private isRunning = false;

    constructor(
        private readonly ragDocumentService: RagDocumentService,
        private readonly redisLockService: RedisLockService,
    ) {}

    onApplicationBootstrap(): void {
        void this.runRecovery('startup');

        this.intervalId = setInterval(() => {
            void this.runRecovery('interval');
        }, RECOVERY_INTERVAL_MS);
    }

    onApplicationShutdown(): void {
        if (!this.intervalId) return;

        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }

    private async runRecovery(trigger: 'startup' | 'interval'): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const lock = await this.redisLockService.acquire(RECOVERY_LOCK_KEY, RECOVERY_LOCK_TTL_MS);
            if (!lock) return;

            try {
                const result = await this.ragDocumentService.recoverStuckProcessingDocuments();

                if (result.checkedCount > 0) {
                    this.logger.log(
                        `RAG 문서 복구 실행: trigger=${trigger}, checked=${result.checkedCount}, ` +
                        `requeued=${result.requeuedCount}, pending=${result.resetToPendingCount}, ` +
                        `failed=${result.markedFailedCount}, active=${result.activeCount}`,
                    );
                }
            } finally {
                const released = await this.redisLockService.release(lock);

                if (!released) {
                    this.logger.warn(`RAG 문서 복구 락이 이미 만료됐거나 소유권이 변경됐습니다: trigger=${trigger}`);
                }
            }
        } catch (error) {
            this.logger.error(
                `RAG 문서 복구 실행 실패: trigger=${trigger}`,
                error instanceof Error ? error.stack : String(error),
            );
        } finally {
            this.isRunning = false;
        }
    }
}