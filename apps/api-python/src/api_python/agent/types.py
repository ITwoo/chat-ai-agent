from dataclasses import dataclass


@dataclass(
    frozen=True,
    slots=True,
)
class AgentToolContext:
    user_id: int