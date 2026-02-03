"""
Xache Functions for AutoGen
Function definitions that can be registered with AutoGen agents
"""

import os
from typing import Any, Dict, List, Optional, Callable

from xache import XacheClient
from ._async_utils import run_sync


def create_xache_client(
    wallet_address: str,
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
) -> XacheClient:
    """Create an Xache client instance"""
    chain_prefix = "sol" if chain == "solana" else "evm"
    did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"
    resolved_api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
    return XacheClient(
        api_url=resolved_api_url,
        did=did,
        private_key=private_key,
    )


def memory_store(
    content: str,
    context: str,
    tags: Optional[List[str]] = None,
    *,
    wallet_address: str,
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
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
    client = create_xache_client(wallet_address, private_key, api_url, chain)

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
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
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
    client = create_xache_client(wallet_address, private_key, api_url, chain)

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


def collective_contribute(
    insight: str,
    domain: str,
    evidence: Optional[str] = None,
    tags: Optional[List[str]] = None,
    *,
    wallet_address: str,
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
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
    client = create_xache_client(wallet_address, private_key, api_url, chain)

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
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
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
    client = create_xache_client(wallet_address, private_key, api_url, chain)

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
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
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
    client = create_xache_client(wallet_address, private_key, api_url, chain)

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
    }
]
