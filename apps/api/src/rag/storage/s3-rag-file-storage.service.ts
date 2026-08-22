import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagFileStorageService } from './rag-file-storage.service';

@Injectable()
export class S3RagFileStorageService implements RagFileStorageService {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly prefix: string;

    constructor(configService: ConfigService) {
        this.bucket = configService.getOrThrow<string>('RAG_S3_BUCKET');
        this.prefix = (configService.get<string>('RAG_S3_PREFIX') ?? 'rag').replace(/^\/+|\/+$/g, '');
        this.client = new S3Client({
            region: configService.getOrThrow<string>('AWS_REGION'),
        });
    }

    private getObjectKey(storageKey: string): string {
        return this.prefix ? `${this.prefix}/${storageKey}` : storageKey;
    }

    private isNotFound(error: unknown): boolean {
        return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
    }

    async write(storageKey: string, data: Buffer): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: this.getObjectKey(storageKey),
                Body: data,
            }),
        );
    }

    async read(storageKey: string): Promise<Buffer | null> {
        try {
            const response = await this.client.send(
                new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: this.getObjectKey(storageKey),
                }),
            );

            if (!response.Body) return Buffer.alloc(0);

            return Buffer.from(await response.Body.transformToByteArray());
        } catch (error) {
            if (this.isNotFound(error)) return null;
            throw error;
        }
    }

    async exists(storageKey: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.bucket,
                    Key: this.getObjectKey(storageKey),
                }),
            );

            return true;
        } catch (error) {
            if (this.isNotFound(error)) return false;
            throw error;
        }
    }

    async delete(storageKey: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: this.getObjectKey(storageKey),
            }),
        );
    }
}
