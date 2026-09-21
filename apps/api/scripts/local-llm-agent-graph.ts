import { HumanMessage, SystemMessage } from '@langchain/core/messages';
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
        {
            expense: {
                findMany: async () => [],
            },
        } as unknown as PrismaService,
        {
            getTools: () => [],
        } as unknown as UserMemoryToolsService,
        analysisClient as unknown as AnalysisClientService,
    );
    const allTools = toolsService.getTools({ userId: 1 });
    const expenseTools = allTools.filter((tool) => tool.name.includes('expense'));

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

        console.log('\n=== Expense Tool Selection Only ===');

    const expenseModel = model.bindTools(expenseTools);

    for (let i = 1; i <= 3; i++) {
        const response = await expenseModel.invoke([
            new HumanMessage('이번 달 지금까지 총 얼마 썼어?'),
        ]);

        console.log(`run ${i}:`, response.tool_calls?.map((toolCall) => toolCall.name) ?? []);
    }

    console.log('\n=== Expense Tool Selection + Minimal Prompt ===');

    const minimalExpensePrompt = `
    너는 지출 관리 Agent다.
    지출 생성, 조회, 통계, 검색, 수정, 삭제 요청을 담당한다.

    +
    요청 목적에 따라 다음 기준으로 Tool을 선택한다.

    - 지출 총액, 건수, 카테고리별 합계처럼 기간 집계가 필요하면 get_expense_summary를 사용한다.
    - 두 기간의 지출 차이를 비교하면 get_expense_comparison을 사용한다.
    - 여러 시점의 소비 변화 흐름을 확인하면 get_expense_trend를 사용한다.
    - 비정상적으로 큰 개별 지출을 찾으면 get_expense_anomalies를 사용한다.
    - 월말 예상 지출을 계산하면 get_expense_forecast를 사용한다.
    - 개별 지출 내역 목록을 조회하면 get_expense_list를 사용한다.
    - find_expenses는 수정하거나 삭제할 특정 지출 대상을 식별할 때만 사용한다.
    - 사용자가 수정이나 삭제를 요청하지 않았다면 find_expenses를 사용하지 않는다.
    +

    지출 수정에서는 다음 규칙을 반드시 따른다.
    `;

    for (let i = 1; i <= 3; i++) {
        const response = await expenseModel.invoke([
            new SystemMessage(minimalExpensePrompt),
            new HumanMessage('이번 달 지금까지 총 얼마 썼어?'),
        ]);

        console.log(`minimal ${i}:`, response.tool_calls?.map((toolCall) => toolCall.name) ?? []);
    }

    const graph = graphFactory.createGraph(
        model,
        expenseTools,
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
