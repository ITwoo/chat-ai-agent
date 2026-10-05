from typing import Literal, TypeGuard

LLM_PROVIDERS = (
    "openai",
    "google",
    "anthropic",
    "ollama",
)

LlmProvider = Literal[
    "openai",
    "google",
    "anthropic",
    "ollama",
]

def is_llm_provider(
    value: str
) -> TypeGuard[LlmProvider]:
    return value in LLM_PROVIDERS