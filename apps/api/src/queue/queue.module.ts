import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AGENT_JOB_QUEUE, RAG_DOCUMENT_QUEUE } from './queue.constants';
import { QueueProducerService } from './queue-producer.service';
import { AgentJobProcessor } from './agent-job.processor';
import { QueueTestController } from './queue-test.controller';
import { createBullRootOptions, queueOptions } from './queue.config';

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
            useFactory: createBullRootOptions,
        }),
        BullModule.registerQueue(...queueOptions),
    ],
    controllers: [QueueTestController],
    providers: [QueueProducerService, AgentJobProcessor],
    exports: [BullModule, QueueProducerService],
})
export class QueueModule {}