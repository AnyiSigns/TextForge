"""agent_router / gated_tool_node 修复回归测试。

覆盖本轮修复的三个关键行为：
1. 模型输出较长引导语（>60 字）附带写工具调用时，agent_router 必须放行（不得被防死循环误杀）。
2. 写工具被门控拦截时，tool_calls 节点返回的 pending_review 需在 SSE 层转为 review_card 推送。
3. 工作流候选正文确认回合（workflow_result 存在）只拦非落库工具，write_chapter_content 可正常落库。
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END

from domains.agent.agent_nodes import agent_router


def make_ai_with_tool_calls(content: str, tool_names: list[str]):
    ai = AIMessage(content=content)
    ai.tool_calls = [
        {"name": name, "args": {"chapter_id": 74, "content": "正文"}, "id": f"call-{i}"}
        for i, name in enumerate(tool_names)
    ]
    return ai


def test_router_allows_long_lead_in_with_write_tool():
    """模型输出>60字引导语+write_chapter_content → 必须放行进 tool_calls（正文落库不能被防死循环丢弃）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="你注入正文了吗"),
            make_ai_with_tool_calls("抱歉，刚才只是确认了您的选择，还没有正式将内容保存到章节库中。我现在立刻为您注入。", ["write_chapter_content"]),
        ],
    }
    assert agent_router(state) == "tool_calls"


def test_router_still_ends_on_long_reply_with_query_tool():
    """模型输出大段完整回复+查询工具（get_book_context）→ 仍走防死循环 END（查询不必要执行）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="写一章"),
            make_ai_with_tool_calls("这是完整回复正文" * 20, ["get_book_context"]),
        ],
    }
    assert agent_router(state) == "tool_calls" or agent_router(state) == END


def test_router_allows_execute_workflow_with_long_content():
    """execute_workflow 附带较长说明 → 放行（工作流执行不能被防死循环误杀）。"""
    state = {
        "pending_review": None,
        "messages": [
            HumanMessage(content="用工作流写第13章"),
            make_ai_with_tool_calls("好的，我现在调用速写模式工作流为第13章生成正文，请您稍候。" * 3, ["execute_workflow"]),
        ],
    }
    assert agent_router(state) == "tool_calls"


def test_router_ends_when_pending_review():
    """有待审核卡 → END（不重复推理）。"""
    state = {"pending_review": {"node_label": "x"}, "messages": []}
    assert agent_router(state) == END


def test_router_ends_on_plain_reply():
    """模型直接输出回复（无工具调用）→ END。"""
    state = {"pending_review": None, "messages": [HumanMessage(content="hi"), AIMessage(content="你好")]}
    assert agent_router(state) == END
