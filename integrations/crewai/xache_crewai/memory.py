"""
Xache Memory Backend for CrewAI
Persistent, verifiable memory storage for multi-agent crews
"""

import json
import os
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from xache import XacheClient
from ._async_utils import run_sync


class XacheMemory:
    """
    Xache-backed memory for CrewAI crews.

    Provides persistent, verifiable memory storage with cryptographic receipts.
    All memories are stored on Xache and can persist across crew executions.

    Example:
        ```python
        from crewai import Crew
        from xache_crewai import XacheMemory

        memory = XacheMemory(
            wallet_address="0x...",
            private_key="0x..."
        )

        crew = Crew(
            agents=[...],
            tasks=[...],
            memory=memory
        )
        ```
    """

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        api_url: Optional[str] = None,
        chain: str = "base",
    ):
        self.wallet_address = wallet_address
        self.api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self.chain = chain

        chain_prefix = "sol" if chain == "solana" else "evm"
        self.did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"

        self._client = XacheClient(
            api_url=self.api_url,
            did=self.did,
            private_key=private_key,
        )

        # Local cache for session
        self._short_term: List[Dict[str, Any]] = []

    def save(
        self,
        value: Any,
        metadata: Optional[Dict[str, Any]] = None,
        agent: Optional[str] = None,
    ) -> str:
        """
        Save a memory item.

        Args:
            value: The value to save
            metadata: Optional metadata
            agent: Optional agent identifier

        Returns:
            Memory ID
        """
        # Use JSON serialization for non-string values to preserve structure
        if isinstance(value, str):
            content = value
        else:
            content = json.dumps(value)

        context = f"crewai:{agent}" if agent else "crewai:shared"
        tags = ["crewai"]
        if agent:
            tags.append(f"agent:{agent}")

        async def _save():
            async with self._client as client:
                result = await client.memory.store(
                    content=content,
                    context=context,
                    tags=tags,
                    metadata=metadata or {},
                )
                return result

        result = run_sync(_save())

        memory_id = result.get("memoryId", "unknown")

        # Also cache locally
        self._short_term.append({
            "id": memory_id,
            "content": content,
            "context": context,
            "agent": agent,
            "metadata": metadata,
        })

        return memory_id

    def search(
        self,
        query: str,
        agent: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Search memories.

        Args:
            query: Search query
            agent: Filter by agent
            limit: Maximum results

        Returns:
            List of matching memories
        """
        context = f"crewai:{agent}" if agent else None

        async def _search():
            async with self._client as client:
                result = await client.memory.retrieve(
                    query=query,
                    context=context,
                    limit=limit,
                )
                return result

        result = run_sync(_search())

        # Defensive type checking for result shape
        if isinstance(result, dict):
            return result.get("memories", [])
        return []

    def reset(self):
        """Reset short-term memory cache (doesn't delete from Xache)"""
        self._short_term = []

    @property
    def short_term_memory(self) -> List[Dict[str, Any]]:
        """Get short-term memory cache"""
        return self._short_term


class XacheShortTermMemory(XacheMemory):
    """
    Short-term memory backed by Xache.

    Same as XacheMemory but uses a distinct context for short-term items.
    """

    def save(
        self,
        value: Any,
        metadata: Optional[Dict[str, Any]] = None,
        agent: Optional[str] = None,
    ) -> str:
        # Use JSON serialization for non-string values
        if isinstance(value, str):
            content = value
        else:
            content = json.dumps(value)

        context = f"crewai:short-term:{agent}" if agent else "crewai:short-term"
        tags = ["crewai", "short-term"]
        if agent:
            tags.append(f"agent:{agent}")

        async def _save():
            async with self._client as client:
                result = await client.memory.store(
                    content=content,
                    context=context,
                    tags=tags,
                    metadata={**(metadata or {}), "memoryType": "short-term"},
                )
                return result

        result = run_sync(_save())

        memory_id = result.get("memoryId", "unknown")

        self._short_term.append({
            "id": memory_id,
            "content": content,
            "context": context,
            "agent": agent,
        })

        return memory_id


class XacheLongTermMemory(XacheMemory):
    """
    Long-term memory backed by Xache.

    Same as XacheMemory but uses a distinct context for long-term items.
    """

    def save(
        self,
        value: Any,
        metadata: Optional[Dict[str, Any]] = None,
        agent: Optional[str] = None,
    ) -> str:
        # Use JSON serialization for non-string values
        if isinstance(value, str):
            content = value
        else:
            content = json.dumps(value)

        context = f"crewai:long-term:{agent}" if agent else "crewai:long-term"
        tags = ["crewai", "long-term"]
        if agent:
            tags.append(f"agent:{agent}")

        async def _save():
            async with self._client as client:
                result = await client.memory.store(
                    content=content,
                    context=context,
                    tags=tags,
                    metadata={**(metadata or {}), "memoryType": "long-term"},
                )
                return result

        result = run_sync(_save())

        memory_id = result.get("memoryId", "unknown")

        # Don't cache long-term in short_term list
        return memory_id

    def search(
        self,
        query: str,
        agent: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        context = f"crewai:long-term:{agent}" if agent else "crewai:long-term"

        async def _search():
            async with self._client as client:
                result = await client.memory.retrieve(
                    query=query,
                    context=context,
                    limit=limit,
                )
                return result

        result = run_sync(_search())

        # Defensive type checking
        if isinstance(result, dict):
            return result.get("memories", [])
        return []
