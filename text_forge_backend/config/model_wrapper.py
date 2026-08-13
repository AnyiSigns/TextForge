from typing import Any

from langchain_core.language_models import BaseChatModel

from config.settings import settings


class _EmbeddingStub:
    async def aembed_query(self, text: str):
        return []


class ModelWrapper:
    """统一封装多Provider的 LLM/Embedding/Vision 实例创建工厂。

    Provider 模型类全部惰性导入（模块级不加载）：langchain 社区包处于日落迁移期，
    任一 provider 包缺失/被移除不会拖垮整个应用启动，仅在用户实际选用该
    provider 时才按 (module, class_name) 动态导入并给出可操作的报错提示。
    """

    # (导入模块, 类名)：统一经 _import_provider 惰性解析
    PROVIDER_MAP: dict[str, tuple[str, str]] = {
        "dashscope": ("langchain_qwq", "ChatQwQ"),
        "deepseek": ("langchain_deepseek", "ChatDeepSeek"),
        "ollama": ("langchain_ollama", "ChatOllama"),
        "openai": ("langchain_openai", "ChatOpenAI"),
        "gemini": ("langchain_google_genai", "ChatGoogleGenerativeAI"),
        "anthropic": ("langchain_anthropic", "ChatAnthropic"),
        "zhipu": ("langchain_community.chat_models", "ChatZhipuAI"),
        "moonshot": ("langchain_moonshot", "ChatMoonshot"),
        "qianfan": ("langchain_community.chat_models", "QianfanChatEndpoint"),
    }

    EMBEDDING_MAP: dict[str, Any] = {
        "dashscope": "_create_dashscope_embedding",
        "cohere": "_create_cohere_embedding",
        "huggingface": "_create_huggingface_embedding",
        "baidu": "_create_baidu_embedding",
        "openai": "_create_openai_embedding",
        "deepseek": "_create_deepseek_embedding",
        "zhipu": "_create_zhipu_embedding",
    }

    VISION_MAP: dict[str, Any] = {
        "openai": "_create_openai_vision",
        "stability": "_create_stability_vision",
        "modelslab": "_create_modelslab_vision",
        "pollinations": "_create_pollinations_vision",
    }

    @classmethod
    def _import_provider(cls, provider: str):
        """惰性导入 provider 的模型类，返回类对象。

        Raises:
            ValueError: provider 未知或对应依赖包缺失/类已迁移时抛出（含安装提示）。
        """
        entry = cls.PROVIDER_MAP.get(provider)
        if not entry:
            raise ValueError(f"不支持的提供商{provider}")
        module_path, class_name = entry
        try:
            import importlib

            module = importlib.import_module(module_path)
            return getattr(module, class_name)
        except (ImportError, AttributeError) as exc:
            raise ValueError(
                f"提供商 {provider} 的模型类 {class_name} 不可用："
                f"请确认已安装对应依赖包（{module_path}）"
            ) from exc

    @classmethod
    def get_model(cls, config: dict[str, Any]) -> BaseChatModel:
        provider = config.get("adapter")
        if not provider:
            raise ValueError("没有配置提供商")
        model_class = cls._import_provider(provider)
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
    def _create_openai_embedding(config: dict[str, Any]):
        try:
            from langchain_openai import OpenAIEmbeddings

            return OpenAIEmbeddings(
                model=config.get("model_id") or "text-embedding-3-small",
                api_key=config.get("api_key", ""),
                base_url=config.get("base_url"),
            )
        except Exception as e:
            raise RuntimeError(f"初始化 openai embedding 失败: {e}")

    @staticmethod
    def _create_deepseek_embedding(config: dict[str, Any]):
        try:
            from langchain_openai import OpenAIEmbeddings

            return OpenAIEmbeddings(
                model=config.get("model_id") or "deepseek-embedding",
                api_key=config.get("api_key", ""),
                base_url=config.get("base_url") or "https://api.deepseek.com",
            )
        except Exception as e:
            raise RuntimeError(f"初始化 deepseek embedding 失败: {e}")

    @staticmethod
    def _create_zhipu_embedding(config: dict[str, Any]):
        try:
            from langchain_community.embeddings import ZhipuAIEmbeddings

            return ZhipuAIEmbeddings(
                model=config.get("model_id") or "embedding-2",
                api_key=config.get("api_key", ""),
            )
        except Exception as e:
            raise RuntimeError(f"初始化 zhipu embedding 失败: {e}")

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
            from langchain_community.llms.stability_ai_image_gen import (  # type: ignore[import-not-found]
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
    def _create_modelslab_vision(config: dict[str, Any]):
        try:
            import requests
            from langchain_community.llms import LLM

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
            from langchain_pollinations import ChatPollinations

            return ChatPollinations(
                model=config.get("model_id") or "flux",
            )
        except Exception as e:
            raise RuntimeError(f"初始化 pollinations vision 失败: {e}")

    @staticmethod
    def _build_kwargs(provider: str, config: dict[str, Any]):
        base = {
            "model": config.get("model_id"),
            "temperature": config.get("temperature", 0.3),
            "max_tokens": config.get("max_tokens"),
        }
        base = {k: v for k, v in base.items() if v is not None}

        if provider == "gemini":
            params = {
                **base,
                "google_api_key": config.get("api_key"),
                "timeout": config.get("request_timeout", settings.LLM_TIMEOUT),
            }
            return {k: v for k, v in params.items() if v is not None}

        if provider == "anthropic":
            params = {
                **base,
                "api_key": config.get("api_key"),
                "anthropic_api_url": config.get("base_url"),
                "timeout": config.get("request_timeout", settings.LLM_TIMEOUT),
            }
            return {k: v for k, v in params.items() if v is not None}

        if provider == "ollama":
            params = {
                **base,
                "base_url": config.get("base_url"),
                "timeout": config.get("request_timeout", settings.LLM_TIMEOUT),
            }
            return {k: v for k, v in params.items() if v is not None}

        params = {
            **base,
            "api_key": config.get("api_key"),
            "base_url": config.get("base_url"),
        }
        # OpenAI 兼容类（含 ChatQwQ/ChatDeepSeek/ChatMoonshot 等）支持 httpx 超时。
        # 不设置时 openai client 默认 600s，MaaS 流式连接挂起会导致任务永久卡住。
        params["timeout"] = config.get("request_timeout", settings.LLM_TIMEOUT)
        return {k: v for k, v in params.items() if v is not None}
