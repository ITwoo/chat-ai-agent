import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueProducerService } from './queue-producer.service';
import { AgentJobProcessor } from './agent-job.processor';
import { createBullRootOptions, queueOptions } from './queue.config';

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: createBullRootOptions,
        }),
        BullModule.registerQueue(...queueOptions),
    ],
    controllers: [],
    providers: [QueueProducerService, AgentJobProcessor],
    exports: [BullModule, QueueProducerService],
})
export class QueueModule {}