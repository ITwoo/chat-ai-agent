import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RedisLockService } from '../redis/redis-lock.service';
import { UserMemoryService } from './user-memory.service';

const BACKFILL_BATCH_SIZE = 25;
const BACKFILL_LOCK_TTL_MS = 30 * 60 * 1000;
const BACKFILL_LOCK_KEY = 'lock:chat-ai-agent:user-memory-embedding-backfill';

@Injectable()
export class UserMemoryEmbeddingBackfillService implements OnApplicationBootstrap {
    private readonly logger = new Logger(UserMemoryEmbeddingBackfillService.name);
    private isRunning = false;

    constructor(
        private readonly userMemoryService: UserMemoryService,
        private readonly redisLockService: RedisLockService,
    ) {}

    onApplicationBootstrap(): void {
        void this.runBackfill();
    }

    private async runBackfill(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const lock = await this.redisLockService.acquire(
                BACKFILL_LOCK_KEY,
                BACKFILL_LOCK_TTL_MS,
            );

            if (!lock) return;

            try {
                await this.processBatches();
            } finally {
                await this.redisLockService.release(lock);
            }
        } catch (error) {
            this.logger.error(
                '사용자 메모리 임베딩 백필 실패',
                error instanceof Error ? error.stack : String(error),
            );
        } finally {
            this.isRunning = false;
        }
    }

    private async processBatches(): Promise<void> {
        let cursor = 0;
        let selectedCount = 0;
        let updatedCount = 0;
        const failedMemoryIds: number[] = [];

        while (true) {
            const batch = await this.userMemoryService.backfillMissingEmbeddings(
                cursor,
                BACKFILL_BATCH_SIZE,
            );

            selectedCount += batch.selectedCount;
            updatedCount += batch.updatedCount;
            failedMemoryIds.push(...batch.failedMemoryIds);

            if (batch.nextCursor === null || batch.selectedCount < BACKFILL_BATCH_SIZE) break;

            cursor = batch.nextCursor;
        }

        if (selectedCount === 0) return;

        this.logger.log(
            `사용자 메모리 임베딩 백필 완료: selected=${selectedCount}, ` +
                `updated=${updatedCount}, failed=${failedMemoryIds.length}`,
        );

        if (failedMemoryIds.length > 0) {
            this.logger.warn(`임베딩 백필 실패 memoryIds=${failedMemoryIds.join(',')}`);
        }
    }
}