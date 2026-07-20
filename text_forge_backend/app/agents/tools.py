from datetime import datetime
from langchain_core.tools import tool



@tool(description="查询城市天气,city:城市名称")
def get_weather(city:str):
    return f"{city}天气晴"

@tool(description="获取当前时间")
def get_time():
    time_now=datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    return time_now

tools=[get_time,get_weather]
