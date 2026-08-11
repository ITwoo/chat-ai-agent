import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';
import { AgentToolsService } from './agent-tools.service';
import { AgentGraphFactory } from './agent-graph.factory';
import { UserMemoryService } from '../user-memory/user-memory.service';
import { AgentContextBuilderService } from './agent-context-builder.service';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { AgentMcpToolsService } from './agent-mcp-tools.service';

describe('AgentService', () => {
    let service: AgentService;

    beforeEach(async () => {
        const module: TestingModule =
            await Test.createTestingModule({
                providers: [
                    AgentService,
                    {
                        provide: ConfigService,
                        useValue: {},
                    },
                    {
                        provide: AgentToolsService,
                        useValue: {},
                    },
                    {
                        provide: AgentMcpToolsService,
                        useValue: {},
                    },
                    {
                        provide: AgentGraphFactory,
                        useValue: {},
                    },
                    {
                        provide: UserMemoryService,
                        useValue: {},
                    },
                    {
                        provide:
                            AgentContextBuilderService,
                        useValue: {},
                    },
                ],
            }).compile();

        service = module.get<AgentService>(
            AgentService,
        );
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});