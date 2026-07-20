from typing import Dict
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph



class GraphRegister:
    def __init__(self):
        self._builders:Dict[str,StateGraph]={}
        self._compiled:Dict[str,CompiledStateGraph]={}

    def register_builder(self,name: str, graph: StateGraph):
        self._builders[name]=graph

    def get_builder(self, name: str):
        return self._builders.get(name)

    def register_compiled(self,name:str,compiled_graph:CompiledStateGraph):
        self._compiled[name]=compiled_graph

    def get_compiled(self,name:str):
        graph=self._compiled.get(name)
        if graph is None:
            raise RuntimeError(f"图{name}未编译")
        return graph

graph_register=GraphRegister()