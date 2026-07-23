import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { RagDocumentController } from './rag-document.controller';
import { RagDocumentService } from './rag-document.service';
import { QueueModule } from '../queue/queue.module';
import { createRagMulterOptions } from './rag-multer.config';
import { RagDocumentProcessor } from './rag-document.processor';
import { RagEmbeddingService } from './rag.embedding.service';

@Module({
    imports: [
        QueueModule,
        MulterModule.registerAsync({
            inject: [ConfigService],
            useFactory: createRagMulterOptions,
        }),
    ],
    controllers: [RagDocumentController],
    providers: [
        RagDocumentService,
        RagDocumentProcessor,
        RagEmbeddingService,
    ],
    exports: [
        RagDocumentService,
        RagEmbeddingService,
    ],
})
export class RagModule {}