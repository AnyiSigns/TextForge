from typing import Any

from langchain_core.language_models import BaseChatModel

from config.model_wrapper import ModelWrapper

# 进程级缓存：避免每个请求都重建 LLM 客户端 / HTTP 连接池（单 worker 下尤其省内存与延迟）。
# 缓存键必须包含 api_key 摘要：不同用户配置同一 (adapter, model_id, base_url) 但不同密钥时，
# 若共享同一客户端实例会造成跨用户凭据串用（B 复用 A 的带 key 客户端）。
_MODEL_CACHE: dict[str, BaseChatModel] = {}
_EMBEDDING_CACHE: dict[str, Any] = {}


def _cred_key(config: dict) -> str:
    """生成凭据摘要，参与缓存键以隔离不同用户/密钥的客户端实例。"""
    api_key = config.get("api_key") or ""
    if api_key:
        import hashlib

        return hashlib.sha256(api_key.encode()).hexdigest()[:16]
    return "nokey"


def _embedding_key(cfg: dict) -> str:
    return f"{cfg.get('adapter')}:{cfg.get('model_id')}:{cfg.get('base_url')}:{_cred_key(cfg)}"


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
        self._cache = _MODEL_CACHE  # 指向进程级共享缓存

        for attr_name, config_field in self.DETAILED:
            config = user_config.get(config_field)
            if not config:
                config = user_config.get("main_config", {})
            model = self._get_create_model(config)
            setattr(self, attr_name, model)

        emb_cfg = user_config.get("embedding_config") or {}
        emb_key = _embedding_key(emb_cfg)
        if emb_key not in _EMBEDDING_CACHE:
            _EMBEDDING_CACHE[emb_key] = ModelWrapper.get_embedding(emb_cfg)
        self.embedding = _EMBEDDING_CACHE[emb_key]

        self.search_config = user_config.get("search_config") or {}

    def _get_create_model(self, config: dict[str, Any]) -> BaseChatModel:
        """创建或从缓存获取模型实例。

        Args:
            config: 模型配置字典。

        Returns:
            BaseChatModel 实例。
        """
        cache_key = (
            f"{config.get("adapter")}:{config.get("model_id")}:{config.get("base_url")}:{_cred_key(config)}"
        )
        if cache_key not in self._cache:
            self._cache[cache_key] = ModelWrapper.get_model(config)
        return self._cache[cache_key]
