import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentToolsService } from './agent-tools.service';
import { AgentGraphFactory } from './agent-graph.factory';
import { RagModule } from '../rag/rag.module';

@Module({
    imports: [RagModule],
    providers: [
        AgentService,
        AgentToolsService,
        AgentGraphFactory,
    ],
    exports: [AgentService],
})
export class AgentModule { }