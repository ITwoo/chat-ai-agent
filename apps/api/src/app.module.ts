import { Module } from '@nestjs/common';
import { BoardsModule } from './boards/boards.module';

import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './chat/chat.module';
import { AgentModule } from './agent/agent.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),    
    PrismaModule,
    AuthModule,
    BoardsModule,
    ChatModule,
    AgentModule,
    RedisModule,
    QueueModule,
    RagModule,
  ],
  controllers: [],
  providers: [],
}) 
export class AppModule {}
