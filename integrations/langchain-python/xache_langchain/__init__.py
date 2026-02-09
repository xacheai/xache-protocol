"""
LangChain integration for Xache Protocol
Drop-in memory, retrieval, and collective intelligence with verifiable receipts

Example:
    ```python
    # One-line memory replacement
    from xache_langchain import XacheMemory

    memory = XacheMemory(
        wallet_address="0x...",
        private_key="0x..."
    )

    # Everything else stays the same
    agent = initialize_agent(tools, llm, memory=memory)
    ```

All Xache features:
    - Memory: Persistent, verifiable memory storage
    - Retrieval: Semantic search for RAG pipelines
    - Collective: Share and learn from agent community
    - Extraction: Auto-extract memories from conversations
    - Reputation: Portable ERC-8004 on-chain reputation
"""

from .memory import XacheMemory, XacheConversationBufferMemory
from .chat_history import XacheChatMessageHistory
from .retriever import XacheRetriever
from .extraction import XacheExtractor, ExtractionResult
from .collective import (
    XacheCollectiveContributeTool,
    XacheCollectiveQueryTool,
)
from .reputation import (
    XacheReputationTool,
    XacheReputationChecker,
    ReputationResult,
)
from .ephemeral import (
    XacheEphemeralCreateSessionTool,
    XacheEphemeralWriteSlotTool,
    XacheEphemeralReadSlotTool,
    XacheEphemeralPromoteTool,
    XacheEphemeralStatusTool,
)
from .graph import (
    XacheGraphExtractTool,
    XacheGraphLoadTool,
    XacheGraphQueryTool,
    XacheGraphAskTool,
    XacheGraphAddEntityTool,
    XacheGraphAddRelationshipTool,
    XacheGraphMergeEntitiesTool,
    XacheGraphEntityHistoryTool,
    XacheGraphRetriever,
)

__version__ = "0.6.0"
__all__ = [
    # Memory
    "XacheMemory",
    "XacheConversationBufferMemory",
    "XacheChatMessageHistory",
    # Retrieval
    "XacheRetriever",
    # Extraction
    "XacheExtractor",
    "ExtractionResult",
    # Collective Intelligence
    "XacheCollectiveContributeTool",
    "XacheCollectiveQueryTool",
    # Reputation
    "XacheReputationTool",
    "XacheReputationChecker",
    "ReputationResult",
    # Knowledge Graph
    "XacheGraphExtractTool",
    "XacheGraphLoadTool",
    "XacheGraphQueryTool",
    "XacheGraphAskTool",
    "XacheGraphAddEntityTool",
    "XacheGraphAddRelationshipTool",
    "XacheGraphMergeEntitiesTool",
    "XacheGraphEntityHistoryTool",
    "XacheGraphRetriever",
    # Ephemeral Context
    "XacheEphemeralCreateSessionTool",
    "XacheEphemeralWriteSlotTool",
    "XacheEphemeralReadSlotTool",
    "XacheEphemeralPromoteTool",
    "XacheEphemeralStatusTool",
]
