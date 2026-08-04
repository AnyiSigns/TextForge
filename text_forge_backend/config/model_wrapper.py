from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_community.chat_models import (
    ChatZhipuAI,
    QianfanChatEndpoint,
)
from langchain_core.language_models import BaseChatModel
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_moonshot import ChatMoonshot
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI


from langchain_qwq import ChatQwQ


class _EmbeddingStub:
    async def aembed_query(self, text: str):
        return []


class ModelWrapper:
    """统一封装多Provider的 LLM/Embedding/Vision 实例创建工厂。"""

    PROVIDER_MAP: dict[str, type[BaseChatModel]] = {
        "dashscope": ChatQwQ,
        "deepseek": ChatDeepSeek,
        "ollama": ChatOllama,
        "openai": ChatOpenAI,
        "gemini": ChatGoogleGenerativeAI,
        "anthropic": ChatAnthropic,
        "zhipu": ChatZhipuAI,
        "moonshot": ChatMoonshot,
        "qianfan": QianfanChatEndpoint,
    }

    EMBEDDING_MAP: dict[str, Any] = {
        "dashscope": "_create_dashscope_embedding",
        "cohere": "_create_cohere_embedding",
        "huggingface": "_create_huggingface_embedding",
        "baidu": "_create_baidu_embedding",
    }

    VISION_MAP: dict[str, Any] = {
        "openai": "_create_openai_vision",
        "stability": "_create_stability_vision",
        "replicate": "_create_replicate_vision",
        "modelslab": "_create_modelslab_vision",
        "pollinations": "_create_pollinations_vision",
    }

    @classmethod
    def get_model(cls, config: dict[str, Any]) -> BaseChatModel:
        provider = config.get("adapter")
        if not provider:
            raise ValueError("没有配置提供商")
        model_class = cls.PROVIDER_MAP.get(provider)
        if not model_class:
            raise ValueError(f"不支持的提供商{provider}")
        kwargs = cls._build_kwargs(provider, config)
        try:
            return model_class(**kwargs)
        except Exception as e:
            raise RuntimeError(f"初始化{provider}的模型{config.get("model_id")}失败{e}")

    @classmethod
    def get_embedding(cls, config: dict[str, Any]):
        provider = config.get("adapter")
        factory_name = cls.EMBEDDING_MAP.get(provider)
        if not factory_name:
            return _EmbeddingStub()
        factory = getattr(cls, factory_name)
        try:
            return factory(config)
        except Exception:
            return _EmbeddingStub()

    @classmethod
    def get_vision(cls, config: dict[str, Any]) -> Any | None:
        provider = config.get("adapter")
        factory_name = cls.VISION_MAP.get(provider)
        if not factory_name:
            return None
        factory = getattr(cls, factory_name)
        try:
            return factory(config)
        except Exception:
            return None

    @staticmethod
    def _create_dashscope_embedding(config: dict[str, Any]):
        try:
            from langchain_community.embeddings import DashScopeEmbeddings

            return DashScopeEmbeddings(
                model=config.get("model_id") or "text-embedding-v4",
                dashscope_api_key=config.get("api_key", ""),
            )
        except Exception as e:
            raise RuntimeError(f"初始化 dashscope embedding 失败: {e}")

    @staticmethod
    def _create_cohere_embedding(config: dict[str, Any]):
        try:
            from langchain_cohere import CohereEmbeddings

            return CohereEmbeddings(
                model=config.get("model_id") or "embed-multilingual-v3.0",
                cohere_api_key=config.get("api_key", ""),
            )
        except Exception as e:
            raise RuntimeError(f"初始化 cohere embedding 失败: {e}")

    @staticmethod
    def _create_huggingface_embedding(config: dict[str, Any]):
        try:
            from langchain_huggingface import HuggingFaceEndpointEmbeddings

            kwargs = {
                "model": config.get("model_id") or "intfloat/multilingual-e5-large"
            }
            if config.get("api_key"):
                kwargs["huggingfacehub_api_token"] = config.get("api_key")
            return HuggingFaceEndpointEmbeddings(**kwargs)
        except Exception as e:
            raise RuntimeError(f"初始化 huggingface embedding 失败: {e}")

    @staticmethod
    def _create_baidu_embedding(config: dict[str, Any]):
        try:
            from langchain_community.embeddings import QianfanEmbeddingsEndpoint

            kwargs = {"model": config.get("model_id") or "bge-large-zh"}
            if config.get("api_key"):
                kwargs["qianfan_ak"] = config.get("api_key")
            if config.get("base_url"):
                kwargs["endpoint"] = config.get("base_url")
            return QianfanEmbeddingsEndpoint(**kwargs)
        except Exception as e:
            raise RuntimeError(f"初始化百度千帆 embedding 失败: {e}")

    @staticmethod
    def _create_openai_vision(config: dict[str, Any]):
        try:
            from openai import OpenAI

            return OpenAI(
                api_key=config.get("api_key"), base_url=config.get("base_url")
            )
        except Exception as e:
            raise RuntimeError(f"初始化 openai vision 失败: {e}")

    @staticmethod
    def _create_stability_vision(config: dict[str, Any]):
        try:
            from langchain_community.llms.stability_ai_image_gen import (
                StabilityAIImageGeneration,
            )

            kwargs = {
                "model": config.get("model_id") or "stable-diffusion-xl-1024-v1-0"
            }
            if config.get("api_key"):
                kwargs["stability_ai_api_key"] = config.get("api_key")
            return StabilityAIImageGeneration(**kwargs)
        except Exception as e:
            raise RuntimeError(f"初始化 stability vision 失败: {e}")

    @staticmethod
    def _create_replicate_vision(config: dict[str, Any]):
        try:
            from langchain_replicate import Replicate

            kwargs = {
                "model": config.get("model_id")
                or "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
                "input": {},
            }
            if config.get("api_key"):
                kwargs["replicate_api_token"] = config.get("api_key")
            return Replicate(**kwargs)
        except Exception as e:
            raise RuntimeError(f"初始化 replicate vision 失败: {e}")

    @staticmethod
    def _create_modelslab_vision(config: dict[str, Any]):
        try:
            import requests
            from langchain.llms.base import LLM

            class ModelsLab(LLM):
                api_key: str = ""
                model_id: str = "midjourney"
                base_url: str = "https://modelslab.com/api/v6/images/text2img"

                def _call(self, prompt: str, **kwargs):
                    payload = {
                        "key": self.api_key,
                        "prompt": prompt,
                        "model_id": self.model_id,
                    }
                    resp = requests.post(self.base_url, json=payload, timeout=30)
                    return resp.json().get("output") or ""

                @property
                def _llm_type(self) -> str:
                    return "modelslab"

            return ModelsLab(
                api_key=config.get("api_key", ""),
                model_id=config.get("model_id", "midjourney"),
                base_url=config.get(
                    "base_url", "https://modelslab.com/api/v6/images/text2img"
                ),
            )
        except Exception as e:
            raise RuntimeError(f"初始化 modelslab vision 失败: {e}")

    @staticmethod
    def _create_pollinations_vision(config: dict[str, Any]):
        try:
            from langchain_pollinations import PollinationsChat

            return PollinationsChat(
                model=config.get("model_id") or "flux",
            )
        except Exception as e:
            raise RuntimeError(f"初始化 pollinations vision 失败: {e}")

    @staticmethod
    def _build_kwargs(provider: str, config: dict[str, Any]):
        base = {
            "model": config.get("model_id"),
            "temperature": config.get("temperature", 0.7),
            "max_tokens": config.get("max_tokens"),
        }
        base = {k: v for k, v in base.items() if v is not None}

        if provider == "gemini":
            params = {**base, "google_api_key": config.get("api_key")}
            return {k: v for k, v in params.items() if v is not None}

        if provider == "anthropic":
            params = {
                **base,
                "api_key": config.get("api_key"),
                "anthropic_api_url": config.get("base_url"),
            }
            return {k: v for k, v in params.items() if v is not None}

        if provider == "ollama":
            params = {**base, "base_url": config.get("base_url")}
            return {k: v for k, v in params.items() if v is not None}

        params = {
            **base,
            "api_key": config.get("api_key"),
            "base_url": config.get("base_url"),
        }
        return {k: v for k, v in params.items() if v is not None}
