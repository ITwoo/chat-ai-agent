import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { RagDocumentController } from './rag-document.controller';
import { RagDocumentService } from './rag-document.service';
import { QueueModule } from '../queue/queue.module';
import { createRagMulterOptions } from './rag-multer.config';
import { RagDocumentProcessor } from './rag-document.processor';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagSearchController } from './rag-search.controller';
import { RagSearchService } from './rag-search.service';
import { RagAnswerService } from './rag-answer.service';
import { RedisModule } from '../redis/redis.module';
import { RagDocumentRecoveryService } from './rag-document-recovery.service';
import { RagTextFileExtractor } from './extractors/rag-text-file-extractor.service';
import { RagDocumentExtractorService } from './extractors/rag-document-extractor.service';
import { RagPdfFileExtractor } from './extractors/rag-pdf-file-extractor.service';

@Module({
    imports: [
        QueueModule,
        RedisModule,
        MulterModule.registerAsync({
            inject: [ConfigService],
            useFactory: createRagMulterOptions,
        }),
    ],
    controllers: [
        RagDocumentController,
        RagSearchController,
    ],
    providers: [
        RagDocumentService,
        RagDocumentRecoveryService,
        RagDocumentProcessor,
        RagEmbeddingService,
        RagSearchService,
        RagAnswerService,
        RagDocumentExtractorService,
        RagPdfFileExtractor,
        RagTextFileExtractor,
    ],
    exports: [
        RagDocumentService,
        RagEmbeddingService,
        RagSearchService,
        RagAnswerService,
    ],
})
export class RagModule { }