import type {
    BullRootModuleOptions,
    RegisterQueueOptions,
} from '@nestjs/bullmq';
import type { ConfigService } from '@nestjs/config';
import {
    AGENT_JOB_QUEUE,
    RAG_DOCUMENT_QUEUE,
} from './queue.constants';

function parseRedisUrl(redisUrl: string) {
    const url = new URL(redisUrl);

    return {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password
            ? decodeURIComponent(url.password)
            : undefined,
        db: Number(url.pathname.slice(1) || 0),
        tls: url.protocol === 'rediss:' ? {} : undefined,
    };
}

export function createBullRootOptions(
    configService: ConfigService,
): BullRootModuleOptions {
    return {
        connection: parseRedisUrl(
            configService.getOrThrow<string>('REDIS_URL'),
        ),
    };
}

const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential' as const,
        delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
};

export const queueOptions: RegisterQueueOptions[] = [
    {
        name: AGENT_JOB_QUEUE,
        defaultJobOptions,
    },
    {
        name: RAG_DOCUMENT_QUEUE,
        defaultJobOptions,
    },
];