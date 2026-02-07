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


# =============================================================================
# Knowledge Graph Functions
# =============================================================================


def graph_extract(
    trace: str,
    context_hint: str = "",
    config: Optional[XacheConfig] = None,
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
) -> Dict[str, Any]:
    """
    Extract entities and relationships from text into the knowledge graph.

    Args:
        trace: Text to extract entities from
        context_hint: Domain hint for extraction
        config: Optional config override
        llm_provider: LLM provider for extraction
        llm_api_key: LLM API key
        llm_model: LLM model override

    Returns:
        Dict with entities and relationships
    """
    client = create_xache_client(config)

    llm_config: Dict[str, Any] = {"type": "xache-managed", "provider": "anthropic", "model": llm_model or None}
    if llm_api_key and llm_provider:
        llm_config = {"type": "api-key", "provider": llm_provider, "apiKey": llm_api_key, "model": llm_model or None}

    async def _extract():
        async with client as c:
            return await c.graph.extract(
                trace=trace, llm_config=llm_config,
                subject={"scope": "GLOBAL"},
                options={"contextHint": context_hint, "confidenceThreshold": 0.7},
            )

    return run_sync(_extract())


def graph_query(
    start_entity: str,
    depth: int = 2,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Query the knowledge graph around a specific entity.

    Args:
        start_entity: Entity name to start from
        depth: Number of hops (default: 2)
        config: Optional config override

    Returns:
        Dict with entities and relationships in the subgraph
    """
    client = create_xache_client(config)

    async def _query():
        async with client as c:
            graph = await c.graph.query(
                subject={"scope": "GLOBAL"}, start_entity=start_entity, depth=depth,
            )
            return graph.to_json()

    return run_sync(_query())


def graph_ask(
    question: str,
    config: Optional[XacheConfig] = None,
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
) -> Dict[str, Any]:
    """
    Ask a natural language question about the knowledge graph.

    Args:
        question: The question to ask
        config: Optional config override
        llm_provider: LLM provider
        llm_api_key: LLM API key
        llm_model: LLM model override

    Returns:
        Dict with answer, confidence, and sources
    """
    client = create_xache_client(config)

    llm_config: Dict[str, Any] = {"type": "xache-managed", "provider": "anthropic", "model": llm_model or None}
    if llm_api_key and llm_provider:
        llm_config = {"type": "api-key", "provider": llm_provider, "apiKey": llm_api_key, "model": llm_model or None}

    async def _ask():
        async with client as c:
            return await c.graph.ask(
                subject={"scope": "GLOBAL"}, question=question, llm_config=llm_config,
            )

    return run_sync(_ask())


def graph_add_entity(
    name: str,
    type: str,
    summary: str = "",
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Add an entity to the knowledge graph.

    Args:
        name: Entity display name
        type: Entity type (person, organization, tool, concept, etc.)
        summary: Brief description
        config: Optional config override

    Returns:
        Dict with entity details
    """
    client = create_xache_client(config)

    async def _add():
        async with client as c:
            return await c.graph.add_entity(
                subject={"scope": "GLOBAL"}, name=name, type=type, summary=summary,
            )

    return run_sync(_add())


def graph_add_relationship(
    from_entity: str,
    to_entity: str,
    type: str,
    description: str = "",
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Create a relationship between two entities.

    Args:
        from_entity: Source entity name
        to_entity: Target entity name
        type: Relationship type
        description: Relationship description
        config: Optional config override

    Returns:
        Dict with relationship details
    """
    client = create_xache_client(config)

    async def _add():
        async with client as c:
            return await c.graph.add_relationship(
                subject={"scope": "GLOBAL"}, from_entity=from_entity,
                to_entity=to_entity, type=type, description=description,
            )

    return run_sync(_add())


def graph_load(
    entity_types: Optional[List[str]] = None,
    valid_at: Optional[str] = None,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Load the full knowledge graph.

    Args:
        entity_types: Filter to specific entity types
        valid_at: Load graph as it existed at this time (ISO8601)
        config: Optional config override

    Returns:
        Dict with entities and relationships
    """
    client = create_xache_client(config)

    async def _load():
        async with client as c:
            graph = await c.graph.load(
                subject={"scope": "GLOBAL"}, entity_types=entity_types, valid_at=valid_at,
            )
            return graph.to_json()

    return run_sync(_load())


def graph_merge_entities(
    source_name: str,
    target_name: str,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Merge two entities into one. The source is superseded, the target is updated.

    Args:
        source_name: Entity to merge FROM (will be superseded)
        target_name: Entity to merge INTO (will be updated)
        config: Optional config override

    Returns:
        Dict with merged entity details
    """
    client = create_xache_client(config)

    async def _merge():
        async with client as c:
            return await c.graph.merge_entities(
                subject={"scope": "GLOBAL"}, source_name=source_name, target_name=target_name,
            )

    return run_sync(_merge())


def graph_entity_history(
    name: str,
    config: Optional[XacheConfig] = None,
) -> Dict[str, Any]:
    """
    Get the version history of an entity.

    Args:
        name: Entity name to look up history for
        config: Optional config override

    Returns:
        Dict with version history
    """
    client = create_xache_client(config)

    async def _history():
        async with client as c:
            return await c.graph.get_entity_history(
                subject={"scope": "GLOBAL"}, name=name,
            )

    return run_sync(_history())


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


@dataclass
class XacheGraphExtractTool:
    """OpenClaw tool for extracting entities/relationships from text."""
    name: str = "xache_graph_extract"
    description: str = (
        "Extract entities and relationships from text into the knowledge graph."
    )

    def run(self, trace: str, context_hint: str = "") -> str:
        result = graph_extract(trace, context_hint)
        entities = result.get("entities", [])
        rels = result.get("relationships", [])
        if not entities and not rels:
            return "No entities or relationships extracted."
        output = f"Extracted {len(entities)} entities, {len(rels)} relationships.\n"
        for e in entities:
            output += f"  {e.get('name', '')} [{e.get('type', '')}]\n"
        return output


@dataclass
class XacheGraphQueryTool:
    """OpenClaw tool for querying the knowledge graph."""
    name: str = "xache_graph_query"
    description: str = (
        "Query the knowledge graph around a specific entity."
    )

    def run(self, start_entity: str, depth: int = 2) -> str:
        data = graph_query(start_entity, depth)
        entities = data.get("entities", [])
        if not entities:
            return f'No entities found connected to "{start_entity}".'
        output = f"Subgraph: {len(entities)} entities\n"
        for e in entities:
            output += f"  {e.get('name', '')} [{e.get('type', '')}]\n"
        return output


@dataclass
class XacheGraphAskTool:
    """OpenClaw tool for asking questions about the knowledge graph."""
    name: str = "xache_graph_ask"
    description: str = (
        "Ask a natural language question about the knowledge graph."
    )

    def run(self, question: str) -> str:
        answer = graph_ask(question)
        output = f"Answer: {answer.get('answer', '')}\nConfidence: {int((answer.get('confidence', 0)) * 100)}%"
        sources = answer.get("sources", [])
        if sources:
            output += "\nSources: " + ", ".join(f"{s.get('name', '')} [{s.get('type', '')}]" for s in sources)
        return output


@dataclass
class XacheGraphAddEntityTool:
    """OpenClaw tool for adding entities to the knowledge graph."""
    name: str = "xache_graph_add_entity"
    description: str = "Add an entity to the knowledge graph."

    def run(self, name: str, type: str, summary: str = "") -> str:
        entity = graph_add_entity(name, type, summary)
        return f'Created entity "{entity.get("name", name)}" [{entity.get("type", type)}]'


@dataclass
class XacheGraphAddRelationshipTool:
    """OpenClaw tool for creating relationships between entities."""
    name: str = "xache_graph_add_relationship"
    description: str = "Create a relationship between two entities in the knowledge graph."

    def run(self, from_entity: str, to_entity: str, type: str, description: str = "") -> str:
        graph_add_relationship(from_entity, to_entity, type, description)
        return f"Created relationship: {from_entity} → {type} → {to_entity}"


@dataclass
class XacheGraphLoadTool:
    """OpenClaw tool for loading the full knowledge graph."""
    name: str = "xache_graph_load"
    description: str = (
        "Load the full knowledge graph. Returns all entities and relationships."
    )

    def run(self, entity_types: Optional[List[str]] = None, valid_at: Optional[str] = None) -> str:
        data = graph_load(entity_types, valid_at)
        entities = data.get("entities", [])
        if not entities:
            return "Knowledge graph is empty."
        output = f"Knowledge graph: {len(entities)} entities, {len(data.get('relationships', []))} relationships\n"
        for e in entities:
            output += f"  {e.get('name', '')} [{e.get('type', '')}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output


@dataclass
class XacheGraphMergeEntitiesTool:
    """OpenClaw tool for merging two entities."""
    name: str = "xache_graph_merge_entities"
    description: str = (
        "Merge two entities into one. Source is superseded, target is updated."
    )

    def run(self, source_name: str, target_name: str) -> str:
        merged = graph_merge_entities(source_name, target_name)
        return f'Merged "{source_name}" into "{target_name}". Result: {merged.get("name", target_name)} [{merged.get("type", "")}]'


@dataclass
class XacheGraphEntityHistoryTool:
    """OpenClaw tool for getting entity version history."""
    name: str = "xache_graph_entity_history"
    description: str = (
        "Get the full version history of an entity."
    )

    def run(self, name: str) -> str:
        versions = graph_entity_history(name)
        if not versions:
            return f'No history found for entity "{name}".'
        if isinstance(versions, list):
            version_list = versions
        else:
            version_list = versions if isinstance(versions, list) else [versions]
        output = f'History for "{name}": {len(version_list)} version(s)\n'
        for v in version_list:
            output += f"  v{v.get('version', '?')} — {v.get('name', '')} [{v.get('type', '')}]"
            if v.get("summary"):
                output += f" | {v['summary'][:80]}"
            output += "\n"
        return output


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
    include_graph: bool = True,
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

    if include_graph:
        tools.extend([
            XacheGraphExtractTool(),
            XacheGraphLoadTool(),
            XacheGraphQueryTool(),
            XacheGraphAskTool(),
            XacheGraphAddEntityTool(),
            XacheGraphAddRelationshipTool(),
            XacheGraphMergeEntitiesTool(),
            XacheGraphEntityHistoryTool(),
        ])

    return tools
