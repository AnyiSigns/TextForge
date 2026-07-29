from typing import Any, Dict
from config.model_wrapper import ModelWrapper
from model.model import ModelConfig
from langchain_core.language_models import BaseChatModel


class ModelFactory:
    DETAILED = {
        ("main", "main_config"),
        ("router", "router_config"),
        ("tool", "tool_config"),
        ("audit", "audit_config"),
    }

    def __init__(self, user_config: dict):
        self.user_config = user_config
        self._cache: Dict[str, BaseChatModel] = {}

        for attr_name, config_field in self.DETAILED:
            config = user_config.get(config_field)
            if not config:
                config = user_config.get("main_config", {})
            model = self._get_create_model(config)
            setattr(self, attr_name, model)

        self.embedding = ModelWrapper.get_embedding(user_config.get("embedding_config") or {})

        self.vision = ModelWrapper.get_vision(user_config.get("vision_config") or {})

        self.search_config = user_config.get("search_config") or {}

    def get_embedding_dimension(self) -> int:
        embedding_config = self.user_config.get("embedding_config") or {}
        adapter = embedding_config.get("adapter", "")
        model_id = embedding_config.get("model_id", "")
        known_dims = {
            "dashscope": 1024,
            "cohere": 1024,
            "huggingface": 1024,
            "qianfan": 768,
        }
        if "text-embedding-v4" in model_id:
            return 1024
        if "bge" in model_id:
            return 768
        if "multilingual" in model_id:
            return 1024
        return known_dims.get(adapter, 1536)

    def _get_create_model(self, config: Dict[str, Any]) -> BaseChatModel:
        cache_key = (
            f"{config.get("adapter")}:{config.get("model_id")}:{config.get("base_url")}"
        )
        if cache_key not in self._cache:
            self._cache[cache_key] = ModelWrapper.get_model(config)
        return self._cache[cache_key]
