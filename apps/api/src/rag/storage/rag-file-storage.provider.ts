import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalRagFileStorageService } from './local-rag-file-storage.service';
import { RagFileStorageService } from './rag-file-storage.service';
import { S3RagFileStorageService } from './s3-rag-file-storage.service';

const RAG_FILE_STORAGE_LOCAL = 'local';
const RAG_FILE_STORAGE_S3 = 's3';

export const ragFileStorageProvider: Provider = {
    provide: RagFileStorageService,
    inject: [ConfigService],
    useFactory: (configService: ConfigService): RagFileStorageService => {
        const storageType = configService.get<string>('RAG_FILE_STORAGE') ?? RAG_FILE_STORAGE_LOCAL;

        if (storageType === RAG_FILE_STORAGE_LOCAL) {
            return new LocalRagFileStorageService(configService);
        }

        if (storageType === RAG_FILE_STORAGE_S3) {
            return new S3RagFileStorageService(configService);
        }

        throw new Error(`지원하지 않는 RAG 파일 저장소입니다: RAG_FILE_STORAGE=${storageType}`);
    },
};
