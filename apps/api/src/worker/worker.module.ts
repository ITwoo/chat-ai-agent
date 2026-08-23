import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AgentJobProcessor } from '../queue/agent-job.processor';
import { RedisModule } from '../redis/redis.module';
import { RagModule } from '../rag/rag.module';
import { RagDocumentProcessor } from '../rag/rag-document.processor';
import { RagDocumentRecoveryService } from '../rag/rag-document-recovery.service';
import { UserMemoryModule } from '../user-memory/user-memory.module';
import { UserMemoryJobProcessor } from '../user-memory/user-memory-job.processor';
import { UserMemoryRecoveryService } from '../user-memory/user-memory-recovery.service';
import { UserMemoryEmbeddingBackfillService } from '../user-memory/user-memory-embedding-backfill.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        QueueModule,
        RedisModule,
        RagModule,
        UserMemoryModule,
    ],
    providers: [
        AgentJobProcessor,
        RagDocumentProcessor,
        RagDocumentRecoveryService,
        UserMemoryJobProcessor,
        UserMemoryRecoveryService,
        UserMemoryEmbeddingBackfillService,
    ],
})
export class WorkerModule {}
