import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';

import { AnalysisClientService } from '../src/analysis/analysis-client.service';
import { AgentGraphFactory } from '../src/agent/agent-graph.factory';
import { AgentToolsService } from '../src/agent/agent-tools.service';

import { PrismaService } from '../src/prisma/prisma.service';
import { RagAnswerService } from '../src/rag/rag-answer.service';
import { RagSearchService } from '../src/rag/rag-search.service';
import { UserMemoryToolsService } from '../src/user-memory/user-memory-tools.service';
import { LlmModelFactory } from '../src/llm/llm-model.factory';
import { ConfigService } from '@nestjs/config';

async function main() {
    const selectedTools: string[] = [];

    const analysisClient = {
        getSpendingSummary: async () => {
            selectedTools.push(
                'get_expense_summary',
            );

            return {
                totalAmount: 100000,
                count: 5,
                averageAmount: 20000,
                topCategory: '식비',
                categories: [],
            };
        },
    };

    const toolsService = new AgentToolsService(
        {} as PrismaService,
        {
            getTools: () => [],
        } as unknown as UserMemoryToolsService,
        analysisClient as unknown as AnalysisClientService,
    );

    const tools = toolsService
        .getTools({
            userId: 1,
        })
        .filter(
            (tool) =>
                tool.name
                === 'get_expense_summary',
        );

    const graphFactory =
        new AgentGraphFactory(
            {} as never,
            {} as RagSearchService,
            {} as RagAnswerService,
        );

    Object.assign(graphFactory, {
        checkpointer: new MemorySaver(),
    });

    const configService =
        new ConfigService(process.env);

    const llmModelFactory =
        new LlmModelFactory(configService);

    const model =
        llmModelFactory.createModel('ollama');

    const graph = graphFactory.createGraph(
        model,
        tools,
        {
            userId: 1,
        },
    );

    const result = await graph.invoke(
        {
            messages: [
                new HumanMessage(
                    '이번 달 지금까지 총 얼마 썼어?',
                ),
            ],
        },
        {
            configurable: {
                thread_id:
                    `local-agent-graph-${Date.now()}`,
            },
        },
    );

    const finalMessage =
        result.messages[
            result.messages.length - 1
        ];

    console.dir(
        {
            selectedTools,
            finalContent:
                finalMessage?.content,
        },
        {
            depth: null,
        },
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
