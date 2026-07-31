from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """定义orm模型基类"""
    __abstract__=True   #不为此类单独创建表