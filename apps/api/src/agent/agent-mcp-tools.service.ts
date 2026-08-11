import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

const MCP_TOOL_TIMEOUT_MS = 15_000;

@Injectable()
export class AgentMcpToolsService implements OnModuleDestroy {
    private readonly logger = new Logger(AgentMcpToolsService.name);
    private readonly serverUrl: string;

    private client?: MultiServerMCPClient;
    private toolsPromise?: Promise<StructuredToolInterface[]>;

    constructor(configService: ConfigService) {
        this.serverUrl = configService.getOrThrow<string>('MCP_ANALYSIS_SERVER_URL');
    }

    async getTools(): Promise<StructuredToolInterface[]> {
        if (!this.toolsPromise) {
            this.toolsPromise = this.loadTools();
        }

        return this.toolsPromise;
    }

    private async loadTools(): Promise<StructuredToolInterface[]> {
        const client = new MultiServerMCPClient({
            mcpServers: {
                personalAnalysis: {
                    transport: 'http',
                    url: this.serverUrl,
                    defaultToolTimeout: MCP_TOOL_TIMEOUT_MS,
                },
            },
            useStandardContentBlocks: true,
        });

        this.client = client;

        try {
            const tools = await client.getTools();

            this.logger.log(`[agent:mcp] loaded tools=${tools.length}`);

            return tools;
        } catch (error) {
            this.logger.warn(
                `[agent:mcp] unavailable: ${error instanceof Error ? error.message : String(error)}`,
            );

            await client.close().catch(() => undefined);

            if (this.client === client) {
                this.client = undefined;
            }

            this.toolsPromise = undefined;

            return [];
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.client?.close();
    }
}