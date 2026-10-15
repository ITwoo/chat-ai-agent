from typing import Literal, TypedDict

from langgraph.graph import END

from api_python.rag.constants import RAG_SEARCH_TOOL_NAME

class AgentToolCall(TypedDict):
    name: str

class RouteAgentToolCallsInput(TypedDict):
    toolCcalls: list[AgentToolCall]
    mutationSignatures: list[str]
    executedMutationSignatures: list[str]
    actionToolRoundCount: int
    maxActionToolRounds: int

AgentRoute = Literal[
    "tools",
    "ragAnswer",
    "rejectRagCombination",
    "rejectToolLimit",
    "rejectDuplicateMutation",
    "__end__",
]

def route_agent_tool_calls(
    input: RouteAgentToolCallsInput,
) -> AgentRoute:
    tool_calls = input["toolCalls"]
    mutation_signatures = input["mutationSignatures"]
    executed_mutation_signatures = input["executedMutationSignatures"]
    action_tool_round_count = input["actionToolRoundCount"]
    max_action_tool_rounds = input["maxActionToolRounds"]

    if len(tool_calls) == 0:
        return END

    rag_tool_calls = [
        tool_call
        for tool_call in tool_calls
        if tool_call["name"] == RAG_SEARCH_TOOL_NAME
    ]

    if len(rag_tool_calls) == 0:
        has_duplicate_mutation = any(
            signature in executed_mutation_signatures
            for signature in mutation_signatures
        )

        if has_duplicate_mutation:
            return "rejectDuplicateMutation"

        if action_tool_round_count >= max_action_tool_rounds:
            return "rejectToolLimit"

        return "tools"

    if len(rag_tool_calls) == 1 and len(tool_calls) == 1:
        return "ragAnswer"

    return "rejectRagCombination"
