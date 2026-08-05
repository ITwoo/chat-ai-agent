import { END } from '@langchain/langgraph';

import { RAG_SEARCH_TOOL_NAME } from '../rag/rag.constants';

export type AgentRoute =
    | 'tools'
    | 'ragAnswer'
    | 'rejectRagCombination'
    | 'rejectToolLimit'
    | 'rejectDuplicateMutation'
    | typeof END;

export type RouteAgentToolCallsInput = {
    toolCalls: Array<{ name: string }>;
    mutationSignatures: string[];
    executedMutationSignatures: string[];
    actionToolRoundCount: number;
    maxActionToolRounds: number;
};

export function routeAgentToolCalls(
    input: RouteAgentToolCallsInput,
): AgentRoute {
    const {
        toolCalls,
        mutationSignatures,
        executedMutationSignatures,
        actionToolRoundCount,
        maxActionToolRounds,
    } = input;

    if (toolCalls.length === 0) return END;

    const ragToolCalls = toolCalls.filter((toolCall) => {
        return toolCall.name === RAG_SEARCH_TOOL_NAME;
    });

    if (ragToolCalls.length === 0) {
        const hasDuplicateMutation = mutationSignatures.some((signature) => {
            return executedMutationSignatures.includes(signature);
        });

        if (hasDuplicateMutation) return 'rejectDuplicateMutation';

        if (actionToolRoundCount >= maxActionToolRounds) {
            return 'rejectToolLimit';
        }

        return 'tools';
    }

    if (ragToolCalls.length === 1 && toolCalls.length === 1) {
        return 'ragAnswer';
    }

    return 'rejectRagCombination';
}