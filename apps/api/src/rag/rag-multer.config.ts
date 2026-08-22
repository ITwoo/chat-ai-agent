import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { extname } from 'node:path';
import { memoryStorage } from 'multer';

export function createRagMulterOptions(
    configService: ConfigService,
): MulterModuleOptions {


    return {
        storage: memoryStorage(),
        limits: {
            files: 1,
            fileSize: 5 * 1024 * 1024,
        },
        fileFilter: (_request, file, callback) => {
            file.originalname = normalizeOriginalFileName(file.originalname);

            const extension =
                extname(file.originalname).toLowerCase();

            const isTextFile =
                file.mimetype === 'text/plain' &&
                extension === '.txt';

            const isPdfFile =
                file.mimetype === 'application/pdf' &&
                extension === '.pdf';

            if (!isTextFile && !isPdfFile) {
                callback(
                    new BadRequestException(
                        '현재는 .txt 또는 .pdf 파일만 업로드할 수 있습니다.',
                    ),
                    false,
                );
                return;
            }

            callback(null, true);
        },
    };

    function normalizeOriginalFileName(fileName: string): string {
        const isLatin1 = [...fileName].every(
            (character) => character.charCodeAt(0) <= 0xff,
        );

        if (!isLatin1) {
            return fileName.normalize('NFC');
        }

        const decoded = Buffer.from(fileName, 'latin1').toString('utf8');

        if (decoded.includes('\uFFFD')) {
            return fileName.normalize('NFC');
        }

        return decoded.normalize('NFC');
    }
}