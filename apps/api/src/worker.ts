import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { createApplicationLogger } from './observability/logger.config';

async function bootstrap() {
    const logger = new Logger('WorkerBootstrap');
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        logger: createApplicationLogger(),
    });

    app.enableShutdownHooks();

    logger.log('BullMQ Worker is running');
}

void bootstrap();