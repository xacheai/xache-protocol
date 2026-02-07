"""
AutoGen integration for Xache Protocol
Verifiable memory, collective intelligence, and reputation for multi-agent conversations

Example:
    ```python
    from autogen import AssistantAgent, UserProxyAgent
    from xache_autogen import XacheMemoryAgent, xache_functions

    # Create an agent with Xache memory capabilities
    assistant = XacheMemoryAgent(
        name="assistant",
        wallet_address="0x...",
        private_key="0x...",
        llm_config={"model": "gpt-4"}
    )

    # Or add Xache functions to any agent
    agent = AssistantAgent(
        name="researcher",
        llm_config={"model": "gpt-4", "functions": xache_functions}
    )
    ```
"""

from .agent import XacheMemoryAgent, XacheAssistantAgent
from .functions import (
    xache_functions,
    memory_store,
    memory_retrieve,
    collective_contribute,
    collective_query,
    check_reputation,
    graph_extract,
    graph_load,
    graph_query,
    graph_ask,
    graph_add_entity,
    graph_add_relationship,
    graph_merge_entities,
    graph_entity_history,
    extract_memories,
)
from .memory import XacheConversationMemory

__version__ = "0.2.0"
__all__ = [
    # Agents
    "XacheMemoryAgent",
    "XacheAssistantAgent",
    # Functions
    "xache_functions",
    "memory_store",
    "memory_retrieve",
    "collective_contribute",
    "collective_query",
    "check_reputation",
    # Graph Functions
    "graph_extract",
    "graph_load",
    "graph_query",
    "graph_ask",
    "graph_add_entity",
    "graph_add_relationship",
    "graph_merge_entities",
    "graph_entity_history",
    # Extraction
    "extract_memories",
    # Memory
    "XacheConversationMemory",
]
