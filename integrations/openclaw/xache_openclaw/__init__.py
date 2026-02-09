"""
OpenClaw integration for Xache Protocol
Collective intelligence, verifiable memory, and portable reputation for AI agents

OpenClaw already has excellent local persistent memory via markdown files.
Xache complements this with:

1. **Collective Intelligence** - Share and query insights across agents
2. **Verifiable Memory** - Store important memories with cryptographic receipts
3. **Portable Reputation** - ERC-8004 reputation that travels with your agent
4. **Cross-Instance Sync** - Sync memories across devices/deployments
5. **Task Receipts** - Verifiable proof when performing tasks for others
6. **Extraction** - Auto-extract heuristics from conversations and contribute to collective

Example:
    ```python
    from openclaw import tool
    from xache_openclaw import xache_tools, collective_contribute, collective_query

    # Register Xache tools with OpenClaw
    tools = xache_tools(
        wallet_address="0x...",
        private_key="0x..."
    )

    # Or use individual tools
    @tool
    def share_insight(insight: str, domain: str):
        '''Share a valuable insight with the agent collective'''
        return collective_contribute(insight, domain)

    # Extract and auto-contribute learnings from conversations
    from xache_openclaw import extract_and_contribute

    result = extract_and_contribute(
        trace=conversation_text,
        llm=lambda p: my_llm.complete(p),
        agent_context="research"
    )
    ```
"""

from .tools import (
    # Tool factory
    xache_tools,
    create_xache_client,
    # Individual tool functions
    collective_contribute,
    collective_query,
    memory_store,
    memory_retrieve,
    check_reputation,
    sync_to_xache,
    # Graph functions
    graph_extract,
    graph_load,
    graph_query,
    graph_ask,
    graph_add_entity,
    graph_add_relationship,
    graph_merge_entities,
    graph_entity_history,
    # OpenClaw-ready tool classes
    XacheCollectiveContributeTool,
    XacheCollectiveQueryTool,
    XacheMemoryStoreTool,
    XacheMemoryRetrieveTool,
    XacheReputationTool,
    XacheSyncTool,
    # Ephemeral functions
    ephemeral_create_session,
    ephemeral_write_slot,
    ephemeral_read_slot,
    ephemeral_promote,
    # Ephemeral tool classes
    XacheEphemeralCreateSessionTool,
    XacheEphemeralWriteSlotTool,
    XacheEphemeralReadSlotTool,
    XacheEphemeralPromoteTool,
    # Graph tool classes
    XacheGraphExtractTool,
    XacheGraphLoadTool,
    XacheGraphQueryTool,
    XacheGraphAskTool,
    XacheGraphAddEntityTool,
    XacheGraphAddRelationshipTool,
    XacheGraphMergeEntitiesTool,
    XacheGraphEntityHistoryTool,
)

from .extraction import (
    # Extraction functions
    MemoryExtractor,
    ExtractedMemory,
    MemoryType,
    extract_from_openclaw_memory,
    extract_and_contribute,
    # Extraction tool
    XacheExtractionTool,
)

from .config import XacheConfig, get_config, set_config, clear_config

__version__ = "0.4.0"
__all__ = [
    # Config
    "XacheConfig",
    "get_config",
    "set_config",
    "clear_config",
    # Tool factory
    "xache_tools",
    "create_xache_client",
    # Functions for direct use
    "collective_contribute",
    "collective_query",
    "memory_store",
    "memory_retrieve",
    "check_reputation",
    "sync_to_xache",
    # Graph functions
    "graph_extract",
    "graph_load",
    "graph_query",
    "graph_ask",
    "graph_add_entity",
    "graph_add_relationship",
    "graph_merge_entities",
    "graph_entity_history",
    # Tool classes
    "XacheCollectiveContributeTool",
    "XacheCollectiveQueryTool",
    "XacheMemoryStoreTool",
    "XacheMemoryRetrieveTool",
    "XacheReputationTool",
    "XacheSyncTool",
    # Graph tool classes
    "XacheGraphExtractTool",
    "XacheGraphLoadTool",
    "XacheGraphQueryTool",
    "XacheGraphAskTool",
    "XacheGraphAddEntityTool",
    "XacheGraphAddRelationshipTool",
    "XacheGraphMergeEntitiesTool",
    "XacheGraphEntityHistoryTool",
    # Ephemeral functions
    "ephemeral_create_session",
    "ephemeral_write_slot",
    "ephemeral_read_slot",
    "ephemeral_promote",
    # Ephemeral tool classes
    "XacheEphemeralCreateSessionTool",
    "XacheEphemeralWriteSlotTool",
    "XacheEphemeralReadSlotTool",
    "XacheEphemeralPromoteTool",
    # Extraction
    "MemoryExtractor",
    "ExtractedMemory",
    "MemoryType",
    "extract_from_openclaw_memory",
    "extract_and_contribute",
    "XacheExtractionTool",
]
