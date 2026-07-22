import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AGENT_JOB_QUEUE } from './queue.constants';
import { QueueProducerService } from './queue-producer.service';
import { AgentJobProcessor } from './agent-job.processor';

function parseRedisUrl(redisUrl: string) {
    const url = new URL(redisUrl);

    return {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        db: Number(url.pathname.slice(1) || 0),
        tls: url.protocol === 'rediss:' ? {} : undefined,
    };
}

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                connection: parseRedisUrl(configService.getOrThrow('REDIS_URL')),
            }),
        }),
        BullModule.registerQueue({
            name: AGENT_JOB_QUEUE,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 500,
            },
        }),
    ],
    providers: [QueueProducerService, AgentJobProcessor],
    exports: [QueueProducerService],
})
export class QueueModule {}