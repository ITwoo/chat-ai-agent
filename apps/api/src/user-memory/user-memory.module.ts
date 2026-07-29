import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserMemoryService } from './user-memory.service';
import { UserMemoryExtractionService } from './user-memory-extraction.service';

@Module({
    imports: [PrismaModule],
    providers: [
        UserMemoryService,
        UserMemoryExtractionService,
    ],
    exports: [
        UserMemoryService,
        UserMemoryExtractionService,
    ],
})
export class UserMemoryModule {}