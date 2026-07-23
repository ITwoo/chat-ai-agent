import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { diskStorage } from 'multer';

export function createRagMulterOptions(
    configService: ConfigService,
): MulterModuleOptions {
    const uploadDir = resolve(
        process.cwd(),
        configService.get<string>('RAG_UPLOAD_DIR') ?? 'uploads/rag',
    );

    return {
        storage: diskStorage({
            destination: uploadDir,
            filename: (_request, file, callback) => {
                const extension =
                    extname(file.originalname).toLowerCase();

                callback(null, `${randomUUID()}${extension}`);
            },
        }),
        limits: {
            files: 1,
            fileSize: 5 * 1024 * 1024,
        },
        fileFilter: (_request, file, callback) => {
            const extension =
                extname(file.originalname).toLowerCase();

            const isTextFile =
                file.mimetype === 'text/plain' &&
                extension === '.txt';

            if (!isTextFile) {
                callback(
                    new BadRequestException(
                        '현재는 .txt 파일만 업로드할 수 있습니다.',
                    ),
                    false,
                );
                return;
            }

            callback(null, true);
        },
    };
}