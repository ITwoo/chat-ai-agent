import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserMemoryService } from './user-memory.service';
import { UserMemoryExtractionService } from './user-memory-extraction.service';
import { UserMemoryToolsService } from './user-memory-tools.service';
import { QueueModule } from '../queue/queue.module';
import { UserMemoryJobProcessor } from './user-memory-job.processor';
import { UserMemoryJobStateService } from './user-memory-job-state.service';

@Module({
    imports: [
        PrismaModule,
        QueueModule
    ],
    providers: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService,
        UserMemoryJobStateService,
        UserMemoryJobProcessor,
    ],
    exports: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService,
        UserMemoryJobStateService,
    ],
})
export class UserMemoryModule {}