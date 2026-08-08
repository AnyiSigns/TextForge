from typing import Any

from langchain_core.language_models import BaseChatModel

from config.model_wrapper import ModelWrapper


class ModelFactory:
    """模型工厂。

    根据用户模型配置统一创建 main/audit/router/tool/embedding/vision 模型实例。
    """

    # 动态在 __init__ 中 setattr 的属性，显式声明便于类型检查
    main: BaseChatModel
    audit: BaseChatModel
    router: BaseChatModel
    tool: BaseChatModel

    DETAILED = {
        ("main", "main_config"),
        ("router", "router_config"),
        ("tool", "tool_config"),
        ("audit", "audit_config"),
    }

    def __init__(self, user_config: dict):
        """初始化 ModelFactory。

        Args:
            user_config: 用户模型配置字典，通常来自 ModelService.get_user_model_config。
        """
        self.user_config = user_config
        self._cache: dict[str, BaseChatModel] = {}

        for attr_name, config_field in self.DETAILED:
            config = user_config.get(config_field)
            if not config:
                config = user_config.get("main_config", {})
            model = self._get_create_model(config)
            setattr(self, attr_name, model)

        self.embedding = ModelWrapper.get_embedding(user_config.get("embedding_config") or {})

        self.search_config = user_config.get("search_config") or {}

    def _get_create_model(self, config: dict[str, Any]) -> BaseChatModel:
        """创建或从缓存获取模型实例。

        Args:
            config: 模型配置字典。

        Returns:
            BaseChatModel 实例。
        """
        cache_key = (
            f"{config.get("adapter")}:{config.get("model_id")}:{config.get("base_url")}"
        )
        if cache_key not in self._cache:
            self._cache[cache_key] = ModelWrapper.get_model(config)
        return self._cache[cache_key]
