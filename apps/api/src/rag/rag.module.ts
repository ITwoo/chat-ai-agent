import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { diskStorage } from 'multer';
import { RagDocumentController } from './rag-document.controller';
import { RagDocumentService } from './rag-document.service';
import { QueueModule } from '../queue/queue.module';
import { createRagMulterOptions } from './rag-multer.config';
import { RagDocumentProcessor } from './rag-document.processor';

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
    ],
    exports: [RagDocumentService],
})
export class RagModule {}