import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentToolsService } from './agent-tools.service';
import { AgentGraphFactory } from './agent-graph.factory';
import { RagModule } from '../rag/rag.module';
import { UserMemoryModule } from '../user-memory/user-memory.module';
import { AgentContextBuilderService } from './agent-context-builder.service';
import { AgentMcpToolsService } from './agent-mcp-tools.service';

@Module({
    imports: [
        RagModule,
        UserMemoryModule,
    ],
    providers: [
        AgentService,
        AgentToolsService,
        AgentGraphFactory,
        AgentContextBuilderService,
        AgentMcpToolsService,
    ],
    exports: [AgentService],
})
export class AgentModule { }