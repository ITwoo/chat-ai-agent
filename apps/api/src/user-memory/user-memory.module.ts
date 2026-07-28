import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserMemoryService } from './user-memory.service';

@Module({
    imports: [PrismaModule],
    providers: [UserMemoryService],
    exports: [UserMemoryService],
})
export class UserMemoryModule {}