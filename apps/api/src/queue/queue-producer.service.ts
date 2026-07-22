import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE } from './queue.constants';

export type HealthCheckJobData = {
    requestedAt: string;
};

@Injectable()
export class QueueProducerService {
    constructor(
        @InjectQueue(AGENT_JOB_QUEUE)
        private readonly agentJobQueue: Queue<HealthCheckJobData>,
    ) {}

    enqueueHealthCheck(): Promise<Job<HealthCheckJobData>> {
        return this.agentJobQueue.add(AGENT_JOB_NAME.HEALTH_CHECK, {
            requestedAt: new Date().toISOString(),
        });
    }
}