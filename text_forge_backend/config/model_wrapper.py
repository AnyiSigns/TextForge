from langchain_core.language_models import BaseChatModel
from typing import Any, Dict, Type
from langchain_qwq import ChatQwen
from langchain_deepseek import ChatDeepSeek
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI


class ModelWrapper:
    PROVIDER_MAP: Dict[str, Type[BaseChatModel]] = {
        "dashscope": ChatQwen,
        "deepseek": ChatDeepSeek,
        "ollama": ChatOllama,
        "openai": ChatOpenAI,
    }

    @classmethod
    def get_model(cls, config: Dict[str, Any]) -> BaseChatModel:
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

    @staticmethod
    def _build_kwargs(provider: str, config: Dict[str, Any]):
        # 基础参数
        base = {
            "model": config.get("model_id"),
            "temperature": config.get("temperature", 0.7),
            "max_tokens": config.get("max_tokens"),
        }
        base = {k: v for k, v in base.items() if v is not None}

        if provider in ("dashscope", "deepseek", "openai"):
            params = {
                **base,
                "base_url": config.get("base_url"),
                "api_key": config.get("api_key"),
            }
            return {k: v for k, v in params.items() if v is not None}
        if provider == "ollama":
            params = {**base, "base_url": config.get("base_url")}
            return {k: v for k, v in params.items() if v is not None}
