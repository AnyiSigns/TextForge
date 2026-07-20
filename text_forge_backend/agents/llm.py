from langchain_qwq import ChatQwQ
from config.settings import settings
from agents.tools import tools
def get_llm():
    return ChatQwQ(
        model=settings.DASHSCOPE_MODEL,
        base_url=settings.DASHSCOPE_BASE_URL,
        api_key=settings.DASHSCOPE_API_KEY,
        streaming=True,
        temperature=0.3,
        max_tokens=3000,
        timeout=60,
        max_retries=3
    )

llm=get_llm().bind_tools(tools)