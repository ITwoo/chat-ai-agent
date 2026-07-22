import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AGENT_JOB_NAME, AGENT_JOB_QUEUE } from './queue.constants';
import type { HealthCheckJobData, HealthCheckJobResult } from './queue.types'

@Processor(AGENT_JOB_QUEUE)
export class AgentJobProcessor extends WorkerHost {
    private readonly logger = new Logger(AgentJobProcessor.name);

    async process(
        job: Job<HealthCheckJobData, HealthCheckJobResult>,
    ): Promise<HealthCheckJobResult> {
        if (job.name !== AGENT_JOB_NAME.HEALTH_CHECK) {
            throw new Error(`지원하지 않는 Agent Job입니다: ${job.name}`);
        }

        const processedAt = new Date().toISOString();
        const elapsedMs = Date.now() - new Date(job.data.requestedAt).getTime();

        this.logger.log(`health-check Job 처리 완료: jobId=${job.id}`);

        return {
            requestedAt: job.data.requestedAt,
            processedAt,
            elapsedMs,
        };
    }
}