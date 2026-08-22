import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { RagFileStorageService } from './rag-file-storage.service';

@Injectable()
export class LocalRagFileStorageService implements RagFileStorageService {
    private readonly uploadDir: string;

    constructor(configService: ConfigService) {
        this.uploadDir = resolve(process.cwd(), configService.get<string>('RAG_UPLOAD_DIR') ?? 'uploads/rag');
    }

    async write(storageKey: string, data: Buffer): Promise<void> {
        await mkdir(this.uploadDir, { recursive: true });
        await writeFile(this.getFilePath(storageKey), data);
    }

    async read(storageKey: string): Promise<Buffer | null> {
        try {
            return await readFile(this.getFilePath(storageKey));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    async exists(storageKey: string): Promise<boolean> {
        try {
            await access(this.getFilePath(storageKey));
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }

    async delete(storageKey: string): Promise<void> {
        try {
            await unlink(this.getFilePath(storageKey));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
    }

    private getFilePath(storageKey: string): string {
        const filePath = resolve(this.uploadDir, storageKey);
        const relativeFilePath = relative(this.uploadDir, filePath);

        if (relativeFilePath === '..' || relativeFilePath.startsWith(`..${sep}`) || isAbsolute(relativeFilePath)) {
            throw new Error(`허용되지 않는 RAG storageKey입니다: ${storageKey}`);
        }

        return filePath;
    }
}