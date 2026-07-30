import {
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import { RedisLockService } from '../redis/redis-lock.service';
import { UserMemoryJobStateService } from './user-memory-job-state.service';

const RECOVERY_INTERVAL_MS = 60 * 1000;
const RECOVERY_LOCK_TTL_MS = 5 * 60 * 1000;
const RECOVERY_LOCK_KEY =
    'lock:chat-ai-agent:user-memory-recovery';

@Injectable()
export class UserMemoryRecoveryService
    implements
        OnApplicationBootstrap,
        OnApplicationShutdown
{
    private readonly logger = new Logger(
        UserMemoryRecoveryService.name,
    );

    private intervalId?: NodeJS.Timeout;
    private isRunning = false;

    constructor(
        private readonly jobStateService:
            UserMemoryJobStateService,
        private readonly redisLockService:
            RedisLockService,
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

    private async runRecovery(
        trigger: 'startup' | 'interval',
    ): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const lock = await this.redisLockService.acquire(
                RECOVERY_LOCK_KEY,
                RECOVERY_LOCK_TTL_MS,
            );

            if (!lock) return;

            try {
                const result =
                    await this.jobStateService.recoverPendingAndStuckExtractions();

                if (result.checkedCount > 0) {
                    this.logger.log(
                        `사용자 메모리 복구: trigger=${trigger}, checked=${result.checkedCount}, requeued=${result.requeuedCount}, pending=${result.resetToPendingCount}, failed=${result.markedFailedCount}, active=${result.activeCount}`,
                    );
                }
            } finally {
                await this.redisLockService.release(lock);
            }
        } catch (error) {
            this.logger.error(
                `사용자 메모리 복구 실패: trigger=${trigger}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        } finally {
            this.isRunning = false;
        }
    }
}