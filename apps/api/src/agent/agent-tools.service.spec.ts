import { Test, TestingModule } from '@nestjs/testing';
import { AgentToolsService } from '../agent/agent-tools.service';

describe('AgentToolsService', () => {
  let service: AgentToolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentToolsService],
    }).compile();

    service = module.get<AgentToolsService>(AgentToolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
