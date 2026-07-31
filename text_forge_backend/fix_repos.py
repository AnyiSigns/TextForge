#!/usr/bin/env python3
"""复制所有 repository/ 下的 .py 文件到对应 domain，修复遗漏的 import 映射。"""

import os, shutil, re, glob

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.join(BASE, "repository")
DOMAINS = os.path.join(BASE, "domains")

# 复制所有 repository 文件到对应 domain（逐一映射，不合并）
REPO_MAP = {
    "user_repo.py": ("domains/auth/repository.py", "UserRepository", "UserTokenRepository"),
    "project_repo.py": ("domains/book/repository.py", "ProjectRepository"),
    "chapter_repo.py": ("domains/book/chapter_repo.py", "ChapterRepository"),
    "chapter_content_repo.py": ("domains/book/chapter_content_repo.py", "ChapterContentRepository"),
    "volume_repo.py": ("domains/book/volume_repo.py", "VolumeRepository"),
    "world_repo.py": ("domains/book/world_repo.py", "WorldRepository", "LocationRepository", "TimelineEventRepository"),
    "outline_repo.py": ("domains/book/outline_repo.py", "OutlineRepository"),
    "structured_repo.py": ("domains/book/structured_repo.py", "StructuredRepository"),
    "context_config_repo.py": ("domains/book/context_config_repo.py", "BookContextConfigRepository"),
    "vector_repo.py": ("domains/knowledge/repository.py", "VectorRepository"),
    "agent_memory_repo.py": ("domains/memory/repository.py", "AgentMemoryRepository"),
    "document_repo.py": ("domains/export/document_repo.py", "DocumentRepository"),
    "upload_repo.py": ("domains/export/upload_repo.py", "UploadRepository"),
    "model_repo.py": ("domains/model/repository.py", "ModelConfRepository"),
    "conv_repo.py": ("domains/writing_session/conv_repo.py", "ConversationRepository"),
    "msg_repo.py": ("domains/writing_session/msg_repo.py", "MessageRepository"),
    "writing_session_repo.py": ("domains/writing_session/repository.py", "WritingSessionRepository"),
    "workflow.py": ("domains/workflow/repository.py", "WorkflowRepository"),
    "base_repo.py": ("domains/shared/base_repo.py", "BaseRepository"),
}

for src, (dst, *classes) in REPO_MAP.items():
    src_path = os.path.join(REPO_DIR, src)
    if not os.path.exists(src_path):
        print(f"  SKIP {src} (not found)")
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src_path, dst)
    print(f"  COPY {src} -> {dst}")

print("\n=== 更新 domains/ import 引用 ===")
# 构建 class -> module 映射表
class_to_module = {}
for src, (dst, *classes) in REPO_MAP.items():
    for cls in classes:
        module_path = dst.replace("/", ".").replace(".py", "")
        class_to_module[cls] = module_path

# 遍历 domains/ 目录修正 import
for root, dirs, files in os.walk(DOMAINS):
    for f in files:
        if not f.endswith(".py"):
            continue
        fp = os.path.join(root, f)
        with open(fp, "r", encoding="utf-8") as fh:
            content = fh.read()
        changed = False
        for cls, module_path in class_to_module.items():
            # 替换 from domains.xxx.repository import ClassName -> from correct.path import ClassName
            new_content = re.sub(
                rf"from domains\.\w+\.repository import ({cls})\b",
                rf"from {module_path} import \1",
                content,
            )
            if new_content != content:
                content = new_content
                changed = True
        if changed:
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"  FIXED {fp}")
print("\n=== Done ===")
