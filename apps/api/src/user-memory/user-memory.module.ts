import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserMemoryService } from './user-memory.service';
import { UserMemoryExtractionService } from './user-memory-extraction.service';
import { UserMemoryToolsService } from './user-memory-tools.service';
import { QueueModule } from '../queue/queue.module';
import { UserMemoryJobStateService } from './user-memory-job-state.service';
import { RedisModule } from '../redis/redis.module';
import { RagModule } from '../rag/rag.module';

@Module({
    imports: [
        PrismaModule,
        QueueModule,
        RedisModule,
        RagModule,
    ],
    providers: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService,
        UserMemoryJobStateService,
    ],
    exports: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService,
        UserMemoryJobStateService,
    ],
})
export class UserMemoryModule {}