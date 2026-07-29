import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserMemoryService } from './user-memory.service';
import { UserMemoryExtractionService } from './user-memory-extraction.service';
import { UserMemoryToolsService } from './user-memory-tools.service';

@Module({
    imports: [PrismaModule],
    providers: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService
    ],
    exports: [
        UserMemoryService,
        UserMemoryExtractionService,
        UserMemoryToolsService,
    ],
})
export class UserMemoryModule {}