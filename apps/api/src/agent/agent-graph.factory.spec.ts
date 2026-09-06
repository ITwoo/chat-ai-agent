import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { RagAnswerService } from '../rag/rag-answer.service';
import { RagSearchService } from '../rag/rag-search.service';
import { AgentGraphFactory } from './agent-graph.factory';

describe('AgentGraphFactory', () => {
    let factory: AgentGraphFactory;

    beforeEach(() => {
        factory = new AgentGraphFactory(
            {} as ConfigService,
            {} as RagSearchService,
            {} as RagAnswerService,
        );
    });

    it('Expense Agent에 모든 지출 분석 Tool을 노출한다', () => {
        const toolNames = [
            'get_expense_summary',
            'get_expense_comparison',
            'get_expense_trend',
            'get_expense_anomalies',
            'get_expense_forecast',
            'get_schedule_list',
        ];

        const tools = toolNames.map(
            (name) =>
                new DynamicStructuredTool({
                    name,
                    description: name,
                    schema: z.object({}),
                    func: async () => '',
                }),
        );

        const bindTools = jest.fn().mockReturnValue({});
        const model = { bindTools };

        (factory as any).createDomainModels(model, tools);

        const expenseTools = bindTools.mock.calls[0][0] as DynamicStructuredTool[];

        expect(expenseTools.map((tool) => tool.name)).toEqual([
            'get_expense_summary',
            'get_expense_comparison',
            'get_expense_trend',
            'get_expense_anomalies',
            'get_expense_forecast',
        ]);

        expect(expenseTools.some((tool) => tool.name === 'get_schedule_list')).toBe(false);
    });
});