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

@Module({
    imports: [
        QueueModule,
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
        RagDocumentProcessor,
        RagEmbeddingService,
        RagSearchService,
    ],
    exports: [
        RagDocumentService,
        RagEmbeddingService,
        RagSearchService,
    ],
})
export class RagModule {}