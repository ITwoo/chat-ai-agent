import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE } from './queue.constants';
import { HealthCheckJobData, HealthCheckJobResult } from './queue.types';

@Injectable()
export class QueueProducerService {
    constructor(
        @InjectQueue(AGENT_JOB_QUEUE)
        private readonly agentJobQueue: Queue<HealthCheckJobData, HealthCheckJobResult>,
    ) {}

    enqueueHealthCheck(): Promise<Job<HealthCheckJobData, HealthCheckJobResult>> {
        return this.agentJobQueue.add(AGENT_JOB_NAME.HEALTH_CHECK, {
            requestedAt: new Date().toISOString(),
        });
    }
}