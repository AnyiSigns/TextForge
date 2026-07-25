from typing import Any, Dict
from config.model_wrapper import ModelWrapper
from model.model import ModelConfig
from langchain_core.language_models import BaseChatModel


class ModelFactory:
    DETAILED = {
        ("main", "main_config"),
        ("compression", "compression"),
        ("router", "router_config"),
        ("tool", "tool_config"),
    }

    def __init__(self, user_config: ModelConfig):
        self.user_config = user_config
        self._cache: Dict[str, BaseChatModel] = {}  # 缓存

        for attr_name, config_field in self.DETAILED:
            config = getattr(user_config, config_field, None)
            if not config:
                config = user_config.main_config
            model = self._get_create_model(config)
            setattr(self, attr_name, model)

    def _get_create_model(self, config: Dict[str, Any]) -> BaseChatModel:
        cache_key = (
            f"{config.get("adapter")}:{config.get("model_id")}:{config.get("base_url")}"
        )
        if cache_key not in self._cache:
            self._cache[cache_key] = ModelWrapper.get_model(config)
        return self._cache[cache_key]
