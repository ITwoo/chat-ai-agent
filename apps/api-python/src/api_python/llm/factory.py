from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from api_python.config import settings
from api_python.llm.provider import (
    LlmProvider,
    is_llm_provider,
)
from api_python.llm.types import ToolCallingChatModel

class LlmModelFactory:
    def create_model(
        self,
        provider: LlmProvider | None = None,
    ) -> ToolCallingChatModel:
        selected_provider = (
            provider
            if provider is not None
            else self._get_configured_provider()
        )

        match selected_provider:
            case "openai":
                return self._create_openai_model()

            case "google":
                return self._create_google_model()

            case "anthropic":
                return self._create_anthropic_model()

            case "ollama":
                return self._create_ollama_model()

    def _get_configured_provider(
            self,
        ) -> LlmProvider:
            provider = (
                settings.llm_provider
                or "openai"
            )

            if not is_llm_provider(provider):
                raise ValueError(
                    "지원하지 않는 LLM_PROVIDER입니다: "
                    f"{provider}"
                )

            return provider
    def _create_openai_model(
        self,
    ) -> ChatOpenAI:
        return ChatOpenAI(
            api_key=self._require(
                "OPENAI_API_KEY",
                settings.openai_api_key,
            ),
            model=self._require(
                "OPENAI_MODEL",
                settings.openai_model,
            ),
            reasoning={
                "effort": "low",
            },
        )

    def _create_google_model(
        self,
    ) -> ChatGoogleGenerativeAI:
        return ChatGoogleGenerativeAI(
            api_key=self._require(
                "GOOGLE_API_KEY",
                settings.google_api_key,
            ),
            model=self._require(
                "GOOGLE_MODEL",
                settings.google_model,
            ),
        )

    def _create_anthropic_model(
        self,
    ) -> ChatAnthropic:
        return ChatAnthropic(
            api_key=self._require(
                "ANTHROPIC_API_KEY",
                settings.anthropic_api_key,
            ),
            model_name=self._require(
                "ANTHROPIC_MODEL",
                settings.anthropic_model,
            ),
        )

    def _create_ollama_model(
        self,
    ) -> ChatOllama:
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0,
            num_ctx=8192,
            reasoning=False,
        )

    @staticmethod
    def _require(
        name: str,
        value: str,
    ) -> str:
        if not value:
            raise ValueError(
                f"환경변수가 없습니다: {name}"
            )
        
        return value

llm_model_factory = LlmModelFactory()


