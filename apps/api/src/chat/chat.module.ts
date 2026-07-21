import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';
import { AgentModule } from '../agent/agent.module';
import { PendingAgentApprovalStoreService } from './pending-agent-approval-store.service';

@Module({
    imports: [JwtModule, AgentModule],
    controllers: [ChatController],
    providers: [
        ChatService,
        ChatGateway,
        PendingAgentApprovalStoreService,
    ],
})
export class ChatModule { }
