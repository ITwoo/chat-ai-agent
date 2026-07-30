import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';
import { AgentModule } from '../agent/agent.module';
import { PendingAgentApprovalStoreService } from './pending-agent-approval-store.service';
import { RedisModule } from '../redis/redis.module';
import { ChatSummaryService } from './chat-summary.service';
import { UserMemoryModule } from '../user-memory/user-memory.module';
import { QueueModule } from '../queue/queue.module';

@Module({
    imports: [
        JwtModule,
        AgentModule,
        RedisModule,
        UserMemoryModule,
        QueueModule,
    ],
    controllers: [ChatController],
    providers: [
        ChatService,
        ChatGateway,
        ChatSummaryService,
        PendingAgentApprovalStoreService,
    ],
})
export class ChatModule { }
