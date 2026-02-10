"""
Xache Functions for AutoGen
Function definitions that can be registered with AutoGen agents
"""

import os
from typing import Any, Callable, Dict, List, Optional

from xache import XacheClient
from ._async_utils import run_sync


def create_xache_client(
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> XacheClient:
    """Create an Xache client instance"""
    chain_prefix = "sol" if chain == "solana" else "evm"
    did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"
    resolved_api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
    return XacheClient(
        api_url=resolved_api_url,
        did=did,
        private_key=private_key,
        signer=signer,
        wallet_provider=wallet_provider,
        encryption_key=encryption_key,
    )


def memory_store(
    content: str,
    context: str,
    tags: Optional[List[str]] = None,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Store a memory with cryptographic receipt.

    Args:
        content: The content to store
        context: Context/category for the memory
        tags: Optional tags for categorization
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with memoryId and receiptId
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _store():
        async with client as c:
            result = await c.memory.store(
                content=content,
                context=context,
                tags=tags or [],
            )
            return result

    result = run_sync(_store())

    return {
        "memoryId": result.get("memoryId"),
        "receiptId": result.get("receiptId"),
        "message": f"Stored memory in context '{context}'"
    }


def memory_retrieve(
    query: str,
    context: Optional[str] = None,
    limit: int = 5,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieve memories by semantic search.

    Args:
        query: Search query
        context: Optional context filter
        limit: Maximum number of results
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with memories list
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _retrieve():
        async with client as c:
            result = await c.memory.retrieve(
                query=query,
                context=context,
                limit=limit,
            )
            return result

    result = run_sync(_retrieve())

    # Defensive type checking
    memories = result.get("memories", []) if isinstance(result, dict) else []
    return {
        "count": len(memories),
        "memories": [
            {
                "content": m.get("content"),
                "context": m.get("context"),
                "relevance": m.get("relevance"),
            }
            for m in memories
        ]
    }


def memory_probe(
    query: str,
    category: Optional[str] = None,
    limit: int = 10,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Probe memories using zero-knowledge semantic matching.

    Uses cognitive fingerprints to find relevant memories without
    knowing exact storage keys. All fingerprint computation is client-side.

    Args:
        query: What to search for in your memories
        category: Optional cognitive category filter
        limit: Maximum number of results (1-50)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with matches list
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _probe():
        async with client as c:
            return await c.memory.probe(
                query=query,
                category=category,
                limit=limit,
            )

    result = run_sync(_probe())

    matches = result.get("matches", []) if isinstance(result, dict) else []
    return {
        "count": len(matches),
        "total": result.get("total", len(matches)) if isinstance(result, dict) else 0,
        "receiptId": result.get("receiptId", "") if isinstance(result, dict) else "",
        "matches": [
            {
                "storageKey": m.get("storageKey"),
                "category": m.get("category"),
                "data": m.get("data"),
            }
            for m in matches
        ]
    }


def collective_contribute(
    insight: str,
    domain: str,
    evidence: Optional[str] = None,
    tags: Optional[List[str]] = None,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Contribute an insight to collective intelligence.

    Args:
        insight: The insight to contribute
        domain: Domain/topic of the insight
        evidence: Optional supporting evidence
        tags: Optional tags
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with heuristicId and receiptId
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _contribute():
        async with client as c:
            result = await c.collective.contribute(
                domain=domain,
                pattern=insight,
                evidence=evidence,
                tags=tags or [],
            )
            return result

    result = run_sync(_contribute())

    return {
        "heuristicId": result.get("heuristicId"),
        "receiptId": result.get("receiptId"),
        "message": f"Contributed insight to domain '{domain}'"
    }


def collective_query(
    query: str,
    domain: Optional[str] = None,
    limit: int = 5,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Query collective intelligence for insights.

    Args:
        query: Search query
        domain: Optional domain filter
        limit: Maximum number of results
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with insights list
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _query():
        async with client as c:
            result = await c.collective.query(
                query=query,
                domain=domain,
                limit=limit,
            )
            return result

    result = run_sync(_query())

    # Defensive type checking
    results = result.get("results", []) if isinstance(result, dict) else []
    return {
        "count": len(results),
        "insights": [
            {
                "pattern": r.get("pattern"),
                "domain": r.get("domain"),
                "relevance": r.get("relevance"),
            }
            for r in results
        ]
    }


def check_reputation(
    agent_did: Optional[str] = None,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check reputation score.

    Args:
        agent_did: Optional DID to check (defaults to own reputation)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with reputation info
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _check():
        async with client as c:
            if agent_did:
                result = await c.reputation.get_score(agent_did=agent_did)
            else:
                result = await c.reputation.get_score()
            return result

    result = run_sync(_check())

    score = result.get("score", 0)

    # Determine level
    if score >= 0.9:
        level = "Elite"
    elif score >= 0.7:
        level = "Trusted"
    elif score >= 0.5:
        level = "Established"
    elif score >= 0.3:
        level = "Developing"
    else:
        level = "New"

    return {
        "score": score,
        "level": level,
        "erc8004Enabled": bool(result.get("erc8004AgentId")),
        "erc8004AgentId": result.get("erc8004AgentId"),
    }


# =============================================================================
# Knowledge Graph Functions
# =============================================================================


def graph_extract(
    trace: str,
    context_hint: str = "",
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract entities and relationships from text into the knowledge graph.

    Args:
        trace: Text to extract entities from
        context_hint: Domain hint for extraction
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use
        llm_provider: LLM provider
        llm_api_key: LLM API key
        llm_model: LLM model override

    Returns:
        Dict with entities and relationships
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

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

    result = run_sync(_extract())
    entities = result.get("entities", [])
    rels = result.get("relationships", [])
    return {
        "entities": [{"name": e.get("name"), "type": e.get("type"), "isNew": e.get("isNew")} for e in entities],
        "relationships": [{"from": r.get("from"), "to": r.get("to"), "type": r.get("type")} for r in rels],
        "message": f"Extracted {len(entities)} entities and {len(rels)} relationships",
    }


def graph_query(
    start_entity: str,
    depth: int = 2,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Query the knowledge graph around a specific entity.

    Args:
        start_entity: Entity name to start from
        depth: Number of hops (default: 2)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with entities and relationships in the subgraph
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _query():
        async with client as c:
            graph = await c.graph.query(
                subject={"scope": "GLOBAL"}, start_entity=start_entity, depth=depth,
            )
            return graph.to_json()

    data = run_sync(_query())
    entities = data.get("entities", [])
    rels = data.get("relationships", [])
    return {
        "entities": [{"name": e.get("name"), "type": e.get("type"), "summary": e.get("summary", "")} for e in entities],
        "relationships": [{"from": r.get("fromKey", "")[:8], "to": r.get("toKey", "")[:8], "type": r.get("type")} for r in rels],
        "message": f"Found {len(entities)} entities and {len(rels)} relationships around '{start_entity}'",
    }


def graph_ask(
    question: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ask a natural language question about the knowledge graph.

    Args:
        question: The question to ask
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use
        llm_provider: LLM provider
        llm_api_key: LLM API key
        llm_model: LLM model override

    Returns:
        Dict with answer, confidence, and sources
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    llm_config: Dict[str, Any] = {"type": "xache-managed", "provider": "anthropic", "model": llm_model or None}
    if llm_api_key and llm_provider:
        llm_config = {"type": "api-key", "provider": llm_provider, "apiKey": llm_api_key, "model": llm_model or None}

    async def _ask():
        async with client as c:
            return await c.graph.ask(
                subject={"scope": "GLOBAL"}, question=question, llm_config=llm_config,
            )

    answer = run_sync(_ask())
    return {
        "answer": answer.get("answer"),
        "confidence": answer.get("confidence"),
        "sources": answer.get("sources", []),
    }


def graph_add_entity(
    name: str,
    type: str,
    summary: str = "",
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add an entity to the knowledge graph.

    Args:
        name: Entity display name
        type: Entity type (person, organization, tool, concept, etc.)
        summary: Brief description
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with entity details
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _add():
        async with client as c:
            return await c.graph.add_entity(
                subject={"scope": "GLOBAL"}, name=name, type=type, summary=summary,
            )

    entity = run_sync(_add())
    return {
        "name": entity.get("name"),
        "type": entity.get("type"),
        "key": entity.get("key"),
        "message": f'Created entity "{name}" [{type}]',
    }


def graph_add_relationship(
    from_entity: str,
    to_entity: str,
    type: str,
    description: str = "",
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a relationship between two entities.

    Args:
        from_entity: Source entity name
        to_entity: Target entity name
        type: Relationship type
        description: Relationship description
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with relationship details
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _add():
        async with client as c:
            return await c.graph.add_relationship(
                subject={"scope": "GLOBAL"}, from_entity=from_entity,
                to_entity=to_entity, type=type, description=description,
            )

    rel = run_sync(_add())
    return {
        "type": rel.get("type"),
        "message": f"Created relationship: {from_entity} → {type} → {to_entity}",
    }


def graph_load(
    entity_types: Optional[List[str]] = None,
    valid_at: Optional[str] = None,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Load the full knowledge graph.

    Args:
        entity_types: Filter to specific entity types
        valid_at: Load graph as it existed at this time (ISO8601)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with entities and relationships
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _load():
        async with client as c:
            graph = await c.graph.load(
                subject={"scope": "GLOBAL"}, entity_types=entity_types, valid_at=valid_at,
            )
            return graph.to_json()

    data = run_sync(_load())
    entities = data.get("entities", [])
    rels = data.get("relationships", [])
    return {
        "entities": [{"name": e.get("name"), "type": e.get("type"), "summary": e.get("summary", "")} for e in entities],
        "relationships": [{"from": r.get("fromKey", "")[:8], "to": r.get("toKey", "")[:8], "type": r.get("type")} for r in rels],
        "message": f"Loaded {len(entities)} entities and {len(rels)} relationships",
    }


def graph_merge_entities(
    source_name: str,
    target_name: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Merge two entities into one. The source is superseded, the target is updated.

    Args:
        source_name: Entity to merge FROM (will be superseded)
        target_name: Entity to merge INTO (will be updated)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with merged entity details
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _merge():
        async with client as c:
            return await c.graph.merge_entities(
                subject={"scope": "GLOBAL"}, source_name=source_name, target_name=target_name,
            )

    merged = run_sync(_merge())
    return {
        "name": merged.get("name"),
        "type": merged.get("type"),
        "version": merged.get("version"),
        "message": f'Merged "{source_name}" into "{target_name}"',
    }


def graph_entity_history(
    name: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get the version history of an entity.

    Args:
        name: Entity name to look up history for
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with version history
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _history():
        async with client as c:
            return await c.graph.get_entity_history(
                subject={"scope": "GLOBAL"}, name=name,
            )

    versions = run_sync(_history())
    return {
        "name": name,
        "versions": [
            {
                "version": v.get("version"),
                "name": v.get("name"),
                "type": v.get("type"),
                "summary": v.get("summary", ""),
                "validFrom": v.get("validFrom"),
                "validTo": v.get("validTo"),
            }
            for v in versions
        ],
        "message": f'Found {len(versions)} version(s) for "{name}"',
    }


def extract_memories(
    trace: str,
    auto_store: bool = False,
    context_hint: str = "",
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract memories from conversation text using LLM-powered extraction.

    Args:
        trace: Text/conversation to extract memories from
        auto_store: Automatically store extracted memories
        context_hint: Domain hint for extraction
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use
        llm_provider: LLM provider
        llm_api_key: LLM API key
        llm_model: LLM model override

    Returns:
        Dict with extracted memories
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    llm_config: Dict[str, Any] = {"type": "xache-managed", "provider": "anthropic", "model": llm_model or None}
    if llm_api_key and llm_provider:
        llm_config = {"type": "api-key", "provider": llm_provider, "apiKey": llm_api_key, "model": llm_model or None}

    async def _extract():
        async with client as c:
            return await c.extraction.extract(
                trace=trace, llm_config=llm_config,
                options={"autoStore": auto_store, "context": {"hint": context_hint} if context_hint else None},
            )

    result = run_sync(_extract())
    memories = result.get("memories", [])
    return {
        "count": len(memories),
        "memories": [{"content": m.get("content"), "type": m.get("type")} for m in memories],
        "receiptId": result.get("receiptId"),
        "message": f"Extracted {len(memories)} memories",
    }


# =============================================================================
# Ephemeral Context Functions
# =============================================================================


def ephemeral_create_session(
    ttl_seconds: int = 3600,
    max_windows: int = 5,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new ephemeral working memory session.

    Args:
        ttl_seconds: Session TTL in seconds (default 3600)
        max_windows: Maximum renewal windows (default 5)
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')

    Returns:
        Dict with session_key and session details
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _create():
        async with client as c:
            return await c.ephemeral.create_session(
                ttl_seconds=ttl_seconds, max_windows=max_windows,
            )

    session = run_sync(_create())
    return {
        "sessionKey": session.session_key,
        "status": session.status,
        "ttlSeconds": session.ttl_seconds,
        "expiresAt": session.expires_at,
        "message": f"Created ephemeral session {session.session_key[:12]}...",
    }


def ephemeral_write_slot(
    session_key: str,
    slot: str,
    data: Dict[str, Any],
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Write data to an ephemeral session slot.

    Args:
        session_key: The session key
        slot: Slot name (conversation, facts, tasks, cache, scratch, handoff)
        data: Data to write
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with confirmation
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _write():
        async with client as c:
            await c.ephemeral.write_slot(session_key, slot, data)

    run_sync(_write())
    return {
        "sessionKey": session_key,
        "slot": slot,
        "message": f'Wrote data to slot "{slot}"',
    }


def ephemeral_read_slot(
    session_key: str,
    slot: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Read data from an ephemeral session slot.

    Args:
        session_key: The session key
        slot: Slot name
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with slot data
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _read():
        async with client as c:
            return await c.ephemeral.read_slot(session_key, slot)

    data = run_sync(_read())
    return {
        "sessionKey": session_key,
        "slot": slot,
        "data": data,
    }


def ephemeral_promote(
    session_key: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Promote an ephemeral session to persistent memory.

    Args:
        session_key: The session key
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with promotion result
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _promote():
        async with client as c:
            return await c.ephemeral.promote_session(session_key)

    result = run_sync(_promote())
    return {
        "memoriesCreated": result.memories_created,
        "memoryIds": result.memory_ids,
        "receiptId": result.receipt_id,
        "message": f"Promoted session, created {result.memories_created} memories",
    }


def ephemeral_status(
    session_key: str,
    *,
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get ephemeral session status and details.

    Args:
        session_key: The session key
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use

    Returns:
        Dict with session details
    """
    client = create_xache_client(wallet_address, private_key, api_url, chain, signer=signer, wallet_provider=wallet_provider, encryption_key=encryption_key)

    async def _status():
        async with client as c:
            return await c.ephemeral.get_session(session_key)

    session = run_sync(_status())
    if not session:
        return {"error": f"Session {session_key[:12]}... not found"}

    return {
        "sessionKey": session.session_key,
        "status": session.status,
        "window": session.window,
        "maxWindows": session.max_windows,
        "ttlSeconds": session.ttl_seconds,
        "expiresAt": session.expires_at,
        "activeSlots": session.active_slots,
        "totalSize": session.total_size,
        "cumulativeCost": session.cumulative_cost,
    }


# Function schemas for AutoGen
xache_functions = [
    {
        "name": "xache_memory_store",
        "description": "Store a memory with cryptographic receipt. Use this for important information that should persist across sessions.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The content to store"
                },
                "context": {
                    "type": "string",
                    "description": "Context/category for the memory (e.g., 'research', 'conversation')"
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags for categorization"
                }
            },
            "required": ["content", "context"]
        }
    },
    {
        "name": "xache_memory_retrieve",
        "description": "Retrieve memories by semantic search. Use this to recall information from previous sessions.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for"
                },
                "context": {
                    "type": "string",
                    "description": "Optional context filter"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 5)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "xache_memory_probe",
        "description": "Probe memories using zero-knowledge semantic matching. Uses cognitive fingerprints to find relevant memories without knowing exact storage keys.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for in your memories"
                },
                "category": {
                    "type": "string",
                    "enum": [
                        "preference", "fact", "event", "procedure", "relationship",
                        "observation", "decision", "goal", "constraint", "reference",
                        "summary", "handoff", "pattern", "feedback", "unknown"
                    ],
                    "description": "Optional cognitive category filter"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 10, max: 50)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "xache_collective_contribute",
        "description": "Contribute an insight to the collective intelligence pool. Use this when you discover something valuable that could help other agents.",
        "parameters": {
            "type": "object",
            "properties": {
                "insight": {
                    "type": "string",
                    "description": "The insight to contribute"
                },
                "domain": {
                    "type": "string",
                    "description": "Domain/topic of the insight"
                },
                "evidence": {
                    "type": "string",
                    "description": "Optional supporting evidence"
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags"
                }
            },
            "required": ["insight", "domain"]
        }
    },
    {
        "name": "xache_collective_query",
        "description": "Query the collective intelligence pool for insights from other agents.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for"
                },
                "domain": {
                    "type": "string",
                    "description": "Optional domain filter"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 5)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "xache_check_reputation",
        "description": "Check reputation score and ERC-8004 status. Higher reputation means lower costs and more trust.",
        "parameters": {
            "type": "object",
            "properties": {
                "agent_did": {
                    "type": "string",
                    "description": "Optional DID to check (defaults to own reputation)"
                }
            }
        }
    },
    {
        "name": "xache_graph_extract",
        "description": "Extract entities and relationships from text into the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "trace": {
                    "type": "string",
                    "description": "Text to extract entities from"
                },
                "context_hint": {
                    "type": "string",
                    "description": "Domain hint for extraction (e.g., 'engineering', 'customer-support')"
                }
            },
            "required": ["trace"]
        }
    },
    {
        "name": "xache_graph_query",
        "description": "Query the knowledge graph around a specific entity. Returns connected entities and relationships.",
        "parameters": {
            "type": "object",
            "properties": {
                "start_entity": {
                    "type": "string",
                    "description": "Name of the entity to start from"
                },
                "depth": {
                    "type": "integer",
                    "description": "Number of hops from start entity (default: 2)"
                }
            },
            "required": ["start_entity"]
        }
    },
    {
        "name": "xache_graph_ask",
        "description": "Ask a natural language question about the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Natural language question about the knowledge graph"
                }
            },
            "required": ["question"]
        }
    },
    {
        "name": "xache_graph_add_entity",
        "description": "Add an entity to the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Entity name"
                },
                "type": {
                    "type": "string",
                    "description": "Entity type (person, organization, tool, concept, etc.)"
                },
                "summary": {
                    "type": "string",
                    "description": "Brief description"
                }
            },
            "required": ["name", "type"]
        }
    },
    {
        "name": "xache_graph_add_relationship",
        "description": "Create a relationship between two entities in the knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "from_entity": {
                    "type": "string",
                    "description": "Source entity name"
                },
                "to_entity": {
                    "type": "string",
                    "description": "Target entity name"
                },
                "type": {
                    "type": "string",
                    "description": "Relationship type (works_at, knows, uses, manages, etc.)"
                },
                "description": {
                    "type": "string",
                    "description": "Relationship description"
                }
            },
            "required": ["from_entity", "to_entity", "type"]
        }
    },
    {
        "name": "xache_graph_load",
        "description": "Load the full knowledge graph. Returns all entities and relationships. Optionally filter by entity type or load a historical snapshot.",
        "parameters": {
            "type": "object",
            "properties": {
                "entity_types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter to specific entity types"
                },
                "valid_at": {
                    "type": "string",
                    "description": "Load graph as it existed at this time (ISO8601)"
                }
            }
        }
    },
    {
        "name": "xache_graph_merge_entities",
        "description": "Merge two entities into one. The source entity is superseded and the target entity is updated with merged attributes.",
        "parameters": {
            "type": "object",
            "properties": {
                "source_name": {
                    "type": "string",
                    "description": "Entity to merge FROM (will be superseded)"
                },
                "target_name": {
                    "type": "string",
                    "description": "Entity to merge INTO (will be updated)"
                }
            },
            "required": ["source_name", "target_name"]
        }
    },
    {
        "name": "xache_graph_entity_history",
        "description": "Get the full version history of an entity. Shows how the entity has changed over time.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Entity name to look up history for"
                }
            },
            "required": ["name"]
        }
    },
    {
        "name": "xache_extract_memories",
        "description": "Extract valuable memories and learnings from conversation text using LLM-powered extraction.",
        "parameters": {
            "type": "object",
            "properties": {
                "trace": {
                    "type": "string",
                    "description": "Text/conversation to extract memories from"
                },
                "auto_store": {
                    "type": "boolean",
                    "description": "Automatically store extracted memories (default: false)"
                },
                "context_hint": {
                    "type": "string",
                    "description": "Domain hint for extraction"
                }
            },
            "required": ["trace"]
        }
    },
    {
        "name": "xache_ephemeral_create_session",
        "description": "Create a new ephemeral working memory session. Returns a session key for storing temporary data in slots.",
        "parameters": {
            "type": "object",
            "properties": {
                "ttl_seconds": {
                    "type": "integer",
                    "description": "Session TTL in seconds (default: 3600)"
                },
                "max_windows": {
                    "type": "integer",
                    "description": "Maximum renewal windows (default: 5)"
                }
            }
        }
    },
    {
        "name": "xache_ephemeral_write_slot",
        "description": "Write data to an ephemeral session slot. Slots: conversation, facts, tasks, cache, scratch, handoff.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_key": {
                    "type": "string",
                    "description": "The ephemeral session key"
                },
                "slot": {
                    "type": "string",
                    "description": "Slot name (conversation, facts, tasks, cache, scratch, handoff)"
                },
                "data": {
                    "type": "object",
                    "description": "Data to write to the slot"
                }
            },
            "required": ["session_key", "slot", "data"]
        }
    },
    {
        "name": "xache_ephemeral_read_slot",
        "description": "Read data from an ephemeral session slot.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_key": {
                    "type": "string",
                    "description": "The ephemeral session key"
                },
                "slot": {
                    "type": "string",
                    "description": "Slot name (conversation, facts, tasks, cache, scratch, handoff)"
                }
            },
            "required": ["session_key", "slot"]
        }
    },
    {
        "name": "xache_ephemeral_promote",
        "description": "Promote an ephemeral session to persistent memory. Extracts valuable data from slots and stores as permanent memories.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_key": {
                    "type": "string",
                    "description": "The ephemeral session key to promote"
                }
            },
            "required": ["session_key"]
        }
    },
    {
        "name": "xache_ephemeral_status",
        "description": "Get ephemeral session status and details. Shows active slots, size, TTL, and window information.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_key": {
                    "type": "string",
                    "description": "The ephemeral session key"
                }
            },
            "required": ["session_key"]
        }
    }
]
