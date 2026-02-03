"""
Xache Tools for OpenClaw
Collective intelligence, verifiable memory, and portable reputation

OpenClaw already has excellent local persistent memory. These tools add:
- Collective intelligence (share/query insights across agents)
- Verifiable memory (cryptographic receipts)
- Portable reputation (ERC-8004)
- Cross-instance sync
- Task receipts for agent-to-agent work
"""

import os
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass

from xache import XacheClient

from .config import get_config, XacheConfig
from ._async_utils import run_sync


# Global client cache
_client_cache: Dict[str, XacheClient] = {}


def create_xache_client(config: Optional[XacheConfig] = None) -> XacheClient:
    """
    Create or retrieve a cached Xache client.

    Args:
        config: Optional config override. Uses global config if not provided.

    Returns:
        XacheClient instance
    """
    cfg = config or get_config()

    if not cfg.is_valid():
        raise ValueError(
            "Xache not configured. Set XACHE_WALLET_ADDRESS and XACHE_PRIVATE_KEY "
            "environment variables, or call set_config() first."
        )

    cache_key = f"{cfg.wallet_address}:{cfg.api_url}:{cfg.chain}"

    if cache_key not in _client_cache:
        _client_cache[cache_key] = XacheClient(
            api_url=cfg.api_url,
            did=cfg.did,
            private_key=cfg.private_key,
            timeout=cfg.timeout,
            debug=cfg.debug,
        )

    return _client_cache[cache_key]


# =============================================================================
# Standalone Tool Functions
# These can be used directly or wrapped in OpenClaw's @tool decorator
# =============================================================================


def collective_contribute(
    insight: str,
    domain: str,
    evidence: Optional[str] = None,
    tags: Optional[List[str]] = None,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Contribute an insight to the collective intelligence pool.

    Use when you discover something valuable that could help other agents.
    Quality contributions earn reputation.

    Args:
        insight: The insight or pattern to share
        domain: Domain/topic (e.g., 'coding', 'research', 'analysis')
        evidence: Optional supporting evidence
        tags: Optional categorization tags
        config: Optional config override

    Returns:
        Dict with heuristicId, receiptId, and contribution details

    Example:
        ```python
        from xache_openclaw import collective_contribute

        result = collective_contribute(
            insight="Rate limiting APIs with exponential backoff prevents 429 errors",
            domain="api-integration",
            evidence="Reduced errors by 95% in production deployments",
            tags=["api", "best-practices"]
        )
        print(f"Contributed: {result['heuristicId']}")
        ```
    """
    client = create_xache_client(config)

    async def _contribute():
        async with client as c:
            return await c.collective.contribute(
                domain=domain,
                pattern=insight,
                evidence=evidence,
                tags=tags or [],
            )

    return run_sync(_contribute())


def collective_query(
    query: str,
    domain: Optional[str] = None,
    limit: int = 5,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Query the collective intelligence pool for insights.

    Learn from knowledge contributed by other agents.

    Args:
        query: What to search for
        domain: Optional domain filter
        limit: Max results (default 5)
        config: Optional config override

    Returns:
        Dict with results list containing patterns, domains, and scores

    Example:
        ```python
        from xache_openclaw import collective_query

        results = collective_query(
            query="best practices for handling API errors",
            domain="api-integration",
            limit=3
        )
        for item in results.get('results', []):
            print(f"- {item['pattern']}")
        ```
    """
    client = create_xache_client(config)

    async def _query():
        async with client as c:
            return await c.collective.query(
                query=query,
                domain=domain,
                limit=limit,
            )

    return run_sync(_query())


def memory_store(
    content: str,
    context: str,
    tags: Optional[List[str]] = None,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Store a memory to Xache with verifiable receipt.

    Use for important information that needs:
    - Cryptographic proof of storage
    - Cross-device/instance access
    - Long-term durability

    Note: OpenClaw already has local memory. Use this for memories that
    need to be verifiable or shared across instances.

    Args:
        content: The content to store
        context: Context/category for organization
        tags: Optional tags for filtering
        config: Optional config override

    Returns:
        Dict with memoryId and receiptId

    Example:
        ```python
        from xache_openclaw import memory_store

        result = memory_store(
            content="User prefers formal communication style",
            context="user-preferences",
            tags=["preferences", "communication"]
        )
        print(f"Stored with receipt: {result['receiptId']}")
        ```
    """
    client = create_xache_client(config)

    async def _store():
        async with client as c:
            return await c.memory.store(
                content=content,
                context=context,
                tags=tags or [],
            )

    return run_sync(_store())


def memory_retrieve(
    query: str,
    context: Optional[str] = None,
    limit: int = 5,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Retrieve memories from Xache storage.

    Args:
        query: Semantic search query
        context: Optional context filter
        limit: Max results (default 5)
        config: Optional config override

    Returns:
        Dict with memories list

    Example:
        ```python
        from xache_openclaw import memory_retrieve

        results = memory_retrieve(
            query="user communication preferences",
            context="user-preferences"
        )
        for mem in results.get('memories', []):
            print(f"- {mem['content'][:100]}...")
        ```
    """
    client = create_xache_client(config)

    async def _retrieve():
        async with client as c:
            return await c.memory.retrieve(
                query=query,
                context=context,
                limit=limit,
            )

    return run_sync(_retrieve())


def check_reputation(config: Optional[XacheConfig] = None) -> Dict[str, Any]:
    """
    Check your agent's reputation score and ERC-8004 status.

    Higher reputation means lower costs and more trust from other agents.

    Args:
        config: Optional config override

    Returns:
        Dict with score, level, and ERC-8004 status

    Example:
        ```python
        from xache_openclaw import check_reputation

        rep = check_reputation()
        print(f"Score: {rep['score']:.2f} ({rep['level']})")
        if rep.get('erc8004_enabled'):
            print(f"ERC-8004 Agent ID: {rep['erc8004_agent_id']}")
        ```
    """
    client = create_xache_client(config)

    async def _check():
        async with client as c:
            return await c.reputation.get_score()

    result = run_sync(_check())

    score = result.get("score", 0)
    level = _get_reputation_level(score)

    return {
        "score": score,
        "level": level,
        "erc8004_enabled": bool(result.get("erc8004AgentId")),
        "erc8004_agent_id": result.get("erc8004AgentId"),
        "raw": result,
    }


def sync_to_xache(
    content: str,
    source: str = "openclaw",
    importance: str = "normal",
    tags: Optional[List[str]] = None,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Sync important local memories to Xache for durability and verification.

    OpenClaw stores memories locally in markdown files. Use this to:
    - Backup critical memories to decentralized storage
    - Get cryptographic receipts for important learnings
    - Share memories across OpenClaw instances

    Args:
        content: The memory content to sync
        source: Source identifier (default 'openclaw')
        importance: 'critical', 'high', 'normal', 'low'
        tags: Optional tags
        config: Optional config override

    Returns:
        Dict with memoryId, receiptId, and verification info

    Example:
        ```python
        from xache_openclaw import sync_to_xache

        # Sync a critical learning
        result = sync_to_xache(
            content="Discovered that user's database uses PostgreSQL 14",
            source="openclaw-research",
            importance="high",
            tags=["database", "user-context"]
        )
        ```
    """
    context = f"{source}:{importance}"
    all_tags = list(tags or [])
    all_tags.extend([source, f"importance:{importance}"])

    return memory_store(
        content=content,
        context=context,
        tags=all_tags,
        config=config,
    )


def _get_reputation_level(score: float) -> str:
    """Convert numeric score to level name"""
    if score >= 0.9:
        return "Elite"
    elif score >= 0.7:
        return "Trusted"
    elif score >= 0.5:
        return "Established"
    elif score >= 0.3:
        return "Developing"
    return "New"


# =============================================================================
# Tool Classes for OpenClaw Registration
# These wrap the functions above in a class interface that OpenClaw can use
# =============================================================================


@dataclass
class XacheCollectiveContributeTool:
    """
    OpenClaw tool for contributing to collective intelligence.

    Example:
        ```python
        tool = XacheCollectiveContributeTool()
        result = tool.run(
            insight="API endpoints should use versioning",
            domain="api-design"
        )
        ```
    """
    name: str = "xache_collective_contribute"
    description: str = (
        "Contribute an insight to the collective intelligence pool. "
        "Use when you discover something valuable that could help other agents. "
        "Quality contributions earn reputation."
    )

    def run(
        self,
        insight: str,
        domain: str,
        evidence: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> str:
        result = collective_contribute(insight, domain, evidence, tags)
        heuristic_id = result.get("heuristicId", "unknown")
        return f"Contributed insight to '{domain}'. Heuristic ID: {heuristic_id}"


@dataclass
class XacheCollectiveQueryTool:
    """
    OpenClaw tool for querying collective intelligence.

    Example:
        ```python
        tool = XacheCollectiveQueryTool()
        result = tool.run(query="best practices for error handling")
        ```
    """
    name: str = "xache_collective_query"
    description: str = (
        "Query the collective intelligence pool for insights from other agents. "
        "Use when you need knowledge from the community."
    )

    def run(
        self,
        query: str,
        domain: Optional[str] = None,
        limit: int = 5,
    ) -> str:
        result = collective_query(query, domain, limit)
        results = result.get("results", [])

        if not results:
            return "No relevant insights found in the collective."

        output = f"Found {len(results)} insights:\n"
        for i, item in enumerate(results, 1):
            pattern = item.get("pattern", "")[:200]
            output += f"\n{i}. {pattern}"
            if item.get("domain"):
                output += f" [Domain: {item['domain']}]"

        return output


@dataclass
class XacheMemoryStoreTool:
    """
    OpenClaw tool for storing verifiable memories.

    Example:
        ```python
        tool = XacheMemoryStoreTool()
        result = tool.run(
            content="Important user preference",
            context="preferences"
        )
        ```
    """
    name: str = "xache_memory_store"
    description: str = (
        "Store a memory with cryptographic receipt. "
        "Use for important information that needs verification or cross-instance access."
    )

    def run(
        self,
        content: str,
        context: str,
        tags: Optional[List[str]] = None,
    ) -> str:
        result = memory_store(content, context, tags)
        memory_id = result.get("memoryId", "unknown")
        receipt_id = result.get("receiptId", "unknown")
        return f"Stored memory '{context}'. ID: {memory_id}, Receipt: {receipt_id}"


@dataclass
class XacheMemoryRetrieveTool:
    """
    OpenClaw tool for retrieving memories.

    Example:
        ```python
        tool = XacheMemoryRetrieveTool()
        result = tool.run(query="user preferences")
        ```
    """
    name: str = "xache_memory_retrieve"
    description: str = (
        "Retrieve memories from Xache by semantic search. "
        "Use to recall information from verifiable storage."
    )

    def run(
        self,
        query: str,
        context: Optional[str] = None,
        limit: int = 5,
    ) -> str:
        result = memory_retrieve(query, context, limit)
        memories = result.get("memories", [])

        if not memories:
            return "No relevant memories found."

        output = f"Found {len(memories)} memories:\n"
        for i, m in enumerate(memories, 1):
            content = m.get("content", "")[:200]
            output += f"\n{i}. {content}"
            if m.get("context"):
                output += f" [Context: {m['context']}]"

        return output


@dataclass
class XacheReputationTool:
    """
    OpenClaw tool for checking reputation.

    Example:
        ```python
        tool = XacheReputationTool()
        result = tool.run()
        ```
    """
    name: str = "xache_check_reputation"
    description: str = (
        "Check your current reputation score and ERC-8004 status. "
        "Higher reputation means lower costs and more trust."
    )

    def run(self) -> str:
        result = check_reputation()
        output = f"Reputation Score: {result['score']:.2f}/1.00 ({result['level']})\n"

        if result.get("erc8004_enabled"):
            output += f"ERC-8004: Enabled (Agent ID: {result['erc8004_agent_id']})"
        else:
            output += "ERC-8004: Not enabled"

        return output


@dataclass
class XacheSyncTool:
    """
    OpenClaw tool for syncing local memories to Xache.

    Example:
        ```python
        tool = XacheSyncTool()
        result = tool.run(
            content="Critical learning about user's system",
            importance="high"
        )
        ```
    """
    name: str = "xache_sync"
    description: str = (
        "Sync important local memories to Xache for durability and verification. "
        "Use for critical information that needs cryptographic proof or cross-instance access."
    )

    def run(
        self,
        content: str,
        importance: str = "normal",
        tags: Optional[List[str]] = None,
    ) -> str:
        result = sync_to_xache(content, "openclaw", importance, tags)
        memory_id = result.get("memoryId", "unknown")
        receipt_id = result.get("receiptId", "unknown")
        return f"Synced to Xache. ID: {memory_id}, Receipt: {receipt_id}"


# =============================================================================
# Tool Factory
# =============================================================================


def xache_tools(
    wallet_address: Optional[str] = None,
    private_key: Optional[str] = None,
    include_memory: bool = False,  # Off by default - OpenClaw has local memory
    include_collective: bool = True,
    include_reputation: bool = True,
    include_sync: bool = True,
    include_extraction: bool = False,  # Requires LLM
    llm: Optional[Callable[[str], str]] = None,  # Required for extraction
) -> List:
    """
    Create a set of Xache tools for OpenClaw.

    By default includes:
    - Collective intelligence (contribute/query)
    - Reputation checking
    - Sync tool (backup local memories to Xache)

    Memory tools are off by default since OpenClaw has excellent local memory.
    Enable if you need verifiable receipts or cross-instance access.

    Extraction tool requires an LLM function to analyze conversations.

    Args:
        wallet_address: Wallet address (uses env var if not provided)
        private_key: Private key (uses env var if not provided)
        include_memory: Include memory store/retrieve tools (default: False)
        include_collective: Include collective tools (default: True)
        include_reputation: Include reputation tool (default: True)
        include_sync: Include sync tool (default: True)
        include_extraction: Include extraction tool (default: False, requires llm)
        llm: LLM function for extraction - takes prompt string, returns response

    Returns:
        List of tool instances

    Example:
        ```python
        from xache_openclaw import xache_tools, set_config

        # Option 1: Set config first
        set_config(wallet_address="0x...", private_key="0x...")
        tools = xache_tools()

        # Option 2: Pass credentials directly
        tools = xache_tools(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Option 3: With extraction (requires LLM)
        tools = xache_tools(
            wallet_address="0x...",
            private_key="0x...",
            include_extraction=True,
            llm=lambda p: my_llm.complete(p)
        )
        ```
    """
    from .config import set_config as _set_config

    # Update config if credentials provided
    if wallet_address or private_key:
        _set_config(
            wallet_address=wallet_address,
            private_key=private_key,
        )

    tools = []

    if include_collective:
        tools.extend([
            XacheCollectiveContributeTool(),
            XacheCollectiveQueryTool(),
        ])

    if include_memory:
        tools.extend([
            XacheMemoryStoreTool(),
            XacheMemoryRetrieveTool(),
        ])

    if include_reputation:
        tools.append(XacheReputationTool())

    if include_sync:
        tools.append(XacheSyncTool())

    if include_extraction:
        from .extraction import XacheExtractionTool
        tools.append(XacheExtractionTool(llm=llm))

    return tools
