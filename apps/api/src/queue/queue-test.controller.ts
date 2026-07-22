import { Controller, Post } from '@nestjs/common';
import { QueueProducerService } from './queue-producer.service';

@Controller('queue')
export class QueueTestController {
    constructor(private readonly queueProducerService: QueueProducerService) {}

    @Post('health-check')
    async enqueueHealthCheck() {
        const job = await this.queueProducerService.enqueueHealthCheck();

        return {
            jobId: job.id,
            name: job.name,
            state: 'queued',
        };
    }
}