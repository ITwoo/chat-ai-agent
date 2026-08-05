import { describe, expect, it } from '@jest/globals';
import { END } from '@langchain/langgraph';

import {
    routeAgentToolCalls,
    RouteAgentToolCallsInput,
} from './agent-route.util';

describe('routeAgentToolCalls', () => {
    const route = (
        overrides: Partial<RouteAgentToolCallsInput> = {},
    ) => {
        return routeAgentToolCalls({
            toolCalls: [],
            mutationSignatures: [],
            executedMutationSignatures: [],
            actionToolRoundCount: 0,
            maxActionToolRounds: 5,
            ...overrides,
        });
    };

    it('Tool 호출이 없으면 종료한다', () => {
        expect(route()).toBe(END);
    });

    it('일반 Tool 호출은 tools로 이동한다', () => {
        expect(route({
            toolCalls: [{ name: 'get_expense_summary' }],
        })).toBe('tools');
    });

    it('동일한 변경 작업은 차단한다', () => {
        expect(route({
            toolCalls: [{ name: 'update_expense' }],
            mutationSignatures: ['update_expense:1'],
            executedMutationSignatures: ['update_expense:1'],
        })).toBe('rejectDuplicateMutation');
    });

    it('중복 작업 검사를 횟수 제한보다 먼저 수행한다', () => {
        expect(route({
            toolCalls: [{ name: 'update_expense' }],
            mutationSignatures: ['update_expense:1'],
            executedMutationSignatures: ['update_expense:1'],
            actionToolRoundCount: 5,
        })).toBe('rejectDuplicateMutation');
    });

    it('Tool 실행 횟수 제한에 도달하면 차단한다', () => {
        expect(route({
            toolCalls: [{ name: 'get_expense_summary' }],
            actionToolRoundCount: 5,
        })).toBe('rejectToolLimit');
    });

    it('RAG Tool 하나만 있으면 ragAnswer로 이동한다', () => {
        expect(route({
            toolCalls: [{ name: 'search_rag_documents' }],
        })).toBe('ragAnswer');
    });

    it('RAG와 다른 Tool을 함께 호출하면 차단한다', () => {
        expect(route({
            toolCalls: [
                { name: 'search_rag_documents' },
                { name: 'get_expense_summary' },
            ],
        })).toBe('rejectRagCombination');
    });

    it('RAG Tool을 두 번 호출해도 조합 오류로 처리한다', () => {
        expect(route({
            toolCalls: [
                { name: 'search_rag_documents' },
                { name: 'search_rag_documents' },
            ],
        })).toBe('rejectRagCombination');
    });
});