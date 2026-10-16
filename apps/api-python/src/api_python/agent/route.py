import json
import logging
from typing import Any, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.graph import END

from api_python.rag.constants import RAG_SEARCH_TOOL_NAME

MAX_ACTION_TOOL_ROUNDS = 5

DUPLICATE_GUARDED_MUTATION_TOOL_NAMES = frozenset({
    "update_expense",
    "update_schedule",
    "delete_schedule",
    "delete_expense",
    "delete_user_memory",
})

TARGET_SEARCH_RULES = {
    "update_expense": ("find_expenses", "expenseId"),
    "delete_expense": ("find_expenses", "expenseId"),
    "update_schedule": ("find_schedules", "scheduleId"),
    "delete_schedule": ("find_schedules", "scheduleId"),
}

logger = logging.getLogger(__name__)

class AgentAssignment(TypedDict):
    domain: Literal["expense", "schedule", "memory", "rag", "general"]
    task: str
    targetIds: list[int]
    allowMultipleTargets: bool

class AgentRoutingState(TypedDict):
    messages: list[BaseMessage]
    agentAssignments: list[AgentAssignment]
    agentDomainIndex: int
    agentTurnStartMessageIndex: int
    executedMutationSignatures: list[str]
    actionToolRoundCount: int

def _get_current_assignment(state: AgentRoutingState) -> AgentAssignment:
    index = state["agentDomainIndex"]
    assignments = state["agentAssignments"]

    if 0 <= index < len(assignments):
        return assignments[index]

    return {
        "domain": "general",
        "task": "사용자의 요청을 처리한다.",
        "targetIds": [],
        "allowMultipleTargets": False,
    }

def _has_next_agent_domain(state: AgentRoutingState) -> bool:
    return state["agentDomainIndex"] + 1 < len(state["agentAssignments"])

def _get_latest_candidate_search_result(
        state: AgentRoutingState,
        search_tool_name: str,
) -> dict[str, Any] | None:
    messages = state["messages"][state["agentTurnStartMessageIndex"]:]

    for message in reversed(messages):
        if not isinstance(message, ToolMessage) or message.name != search_tool_name:
            continue

        if not isinstance(message.content, str):
            return None

        try:
            result = json.loads(message.content)
        except json.JSONDecodeError:
            return None

        if (
            isinstance(result, dict)
            and type(result.get("count")) is int
        ):
            return result

        return None
    return None

def _get_candidate_ids(result: dict[str, Any]) -> set[int]:
    expenses = result.get("expenses") or []
    schedules = result.get("schedules") or []

    return {
        item["id"]
        for item in [*expenses, *schedules]
    }

def _get_ambiguous_target_result(
    state: AgentRoutingState,
    tool_calls: list[dict[str, Any]],
) -> dict[str, Any] | None:
    assignment = _get_current_assignment(state)

    for tool_call in tool_calls:
        rule = TARGET_SEARCH_RULES.get(tool_call["name"])

        if rule is None:
            continue

        search_tool_name, id_arg = rule
        args = tool_call.get("args")

        if not isinstance(args, dict):
            continue

        target_id = args.get(id_arg)

        if not isinstance(target_id, (int, float)) or isinstance(target_id, bool):
            continue

        result = _get_latest_candidate_search_result(state, search_tool_name)

        if result is None or result["count"] <= 1:
            continue

        if target_id in assignment["targetIds"]:
            continue

        candidate_ids = _get_candidate_ids(result)

        if assignment["allowMultipleTargets"] and target_id in candidate_ids:
            continue

        return {"toolName": tool_call["name"], "result": result}

    return None 

def _serialize_tool_args(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=("," ,":"),
        sort_keys=True,
    )

def _get_mutation_signatures(
    tool_calls: list[dict[str, Any]],
) -> list[str]:
    return [
        f'{tool_call["name"]}:{_serialize_tool_args(tool_call.get("args"))}'
        for tool_call in tool_calls
        if tool_call["name"] in DUPLICATE_GUARDED_MUTATION_TOOL_NAMES
    ]

def route_after_model(state: AgentRoutingState) -> str:
    messages = state["messages"]
    last_message = messages[-1] if messages else None

    if not isinstance(last_message, AIMessage):
        return END

    tool_calls = last_message.tool_calls or []

    ambiguous_target = _get_ambiguous_target_result(state, tool_calls)

    if ambiguous_target is not None:
        return "rejectAmbiguousTarget"

    if not tool_calls and _has_next_agent_domain(state):
        return "advanceDomain"

    if tool_calls:
        tool_names = ", ".join(tool_call["name"] for tool_call in tool_calls)
        logger.info("[agent:tool_calls] %s", tool_names)

    return route_agent_tool_calls({
        "toolCalls": tool_calls,
        "mutationSignatures": _get_mutation_signatures(tool_calls),
        "executedMutationSignatures": state["executedMutationSignatures"],
        "actionToolRoundCount": state["actionToolRoundCount"],
        "maxActionToolRounds": MAX_ACTION_TOOL_ROUNDS,
    })


class AgentToolCall(TypedDict):
    name: str

class RouteAgentToolCallsInput(TypedDict):
    toolCalls: list[AgentToolCall]
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
