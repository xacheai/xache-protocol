"""
CrewAI integration for Xache Protocol
Verifiable memory, collective intelligence, and reputation for multi-agent crews

Example:
    ```python
    from crewai import Agent, Task, Crew
    from xache_crewai import XacheMemory, xache_tools

    # Add Xache memory to your crew
    memory = XacheMemory(
        wallet_address="0x...",
        private_key="0x..."
    )

    # Create agents with Xache tools
    agent = Agent(
        role="Researcher",
        tools=xache_tools(wallet_address="0x...", private_key="0x...")
    )

    crew = Crew(agents=[agent], memory=memory)
    ```
"""

from .tools import (
    xache_tools,
    XacheMemoryStoreTool,
    XacheMemoryRetrieveTool,
    XacheCollectiveContributeTool,
    XacheCollectiveQueryTool,
    XacheReputationTool,
)
from .memory import XacheMemory, XacheShortTermMemory, XacheLongTermMemory

__version__ = "0.1.0"
__all__ = [
    # Tools
    "xache_tools",
    "XacheMemoryStoreTool",
    "XacheMemoryRetrieveTool",
    "XacheCollectiveContributeTool",
    "XacheCollectiveQueryTool",
    "XacheReputationTool",
    # Memory
    "XacheMemory",
    "XacheShortTermMemory",
    "XacheLongTermMemory",
]
