import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

@Injectable()
export class AgentMcpToolsService {
    private readonly client: MultiServerMCPClient;
    private tools?: StructuredToolInterface[];

    constructor(configService: ConfigService) {
        const serverUrl = configService.getOrThrow<string>(
            'MCP_ANALYSIS_SERVER_URL',
        );

        this.client = new MultiServerMCPClient({
            personalAnalysis: {
                transport: 'http',
                url: serverUrl,
            },
        });
    }

    async getTools(): Promise<StructuredToolInterface[]> {
        if (this.tools) return this.tools;

        this.tools = await this.client.getTools();

        return this.tools;
    }
}