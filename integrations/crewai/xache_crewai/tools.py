"""
Xache Tools for CrewAI
Provide memory, collective intelligence, and reputation capabilities to agents
"""

import os
from typing import List, Optional, Type
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from xache import XacheClient
from ._async_utils import run_sync


class MemoryStoreInput(BaseModel):
    """Input for memory store tool"""
    content: str = Field(description="The content to store")
    context: str = Field(description="Context/category for the memory")
    tags: Optional[List[str]] = Field(default=None, description="Tags for categorization")


class MemoryRetrieveInput(BaseModel):
    """Input for memory retrieve tool"""
    query: str = Field(description="What to search for")
    context: Optional[str] = Field(default=None, description="Filter by context")
    limit: int = Field(default=5, description="Number of results")


class CollectiveContributeInput(BaseModel):
    """Input for collective contribute tool"""
    insight: str = Field(description="The insight to contribute")
    domain: str = Field(description="Domain/topic of the insight")
    evidence: Optional[str] = Field(default=None, description="Supporting evidence")
    tags: Optional[List[str]] = Field(default=None, description="Tags")


class CollectiveQueryInput(BaseModel):
    """Input for collective query tool"""
    query: str = Field(description="What to search for")
    domain: Optional[str] = Field(default=None, description="Filter by domain")
    limit: int = Field(default=5, description="Number of results")


class XacheMemoryStoreTool(BaseTool):
    """
    Store memories to Xache with verifiable receipts.

    Use this to persistently store important information, learnings,
    or context that should be available in future sessions.
    """
    name: str = "xache_memory_store"
    description: str = (
        "Store a memory with cryptographic receipt. "
        "Use this for important information that should persist across sessions."
    )
    args_schema: Type[BaseModel] = MemoryStoreInput

    wallet_address: str
    private_key: str
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs):
        # Set api_url from env if not provided
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            timeout=self.timeout,
            debug=self.debug,
        )

    def _run(self, content: str, context: str, tags: Optional[List[str]] = None) -> str:

        async def _store():
            async with self._client as client:
                result = await client.memory.store(
                    content=content,
                    context=context,
                    tags=tags or [],
                )
                return result

        result = run_sync(_store())

        memory_id = result.get("memoryId", "unknown")
        receipt_id = result.get("receiptId", "unknown")
        return f"Stored memory '{context}'. ID: {memory_id}, Receipt: {receipt_id}"


class XacheMemoryRetrieveTool(BaseTool):
    """
    Retrieve memories from Xache storage.

    Use this to recall stored information, learnings, or context
    from previous sessions.
    """
    name: str = "xache_memory_retrieve"
    description: str = (
        "Retrieve memories by semantic search. "
        "Use this to recall information from previous sessions."
    )
    args_schema: Type[BaseModel] = MemoryRetrieveInput

    wallet_address: str
    private_key: str
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs):
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            timeout=self.timeout,
            debug=self.debug,
        )

    def _run(
        self,
        query: str,
        context: Optional[str] = None,
        limit: int = 5
    ) -> str:

        async def _retrieve():
            async with self._client as client:
                result = await client.memory.retrieve(
                    query=query,
                    context=context,
                    limit=limit,
                )
                return result

        result = run_sync(_retrieve())

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


class XacheCollectiveContributeTool(BaseTool):
    """
    Contribute insights to collective intelligence.

    Share valuable learnings with other agents. Quality contributions
    earn reputation.
    """
    name: str = "xache_collective_contribute"
    description: str = (
        "Contribute an insight to the collective intelligence pool. "
        "Use this when you discover something valuable that could help other agents."
    )
    args_schema: Type[BaseModel] = CollectiveContributeInput

    wallet_address: str
    private_key: str
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs):
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            timeout=self.timeout,
            debug=self.debug,
        )

    def _run(
        self,
        insight: str,
        domain: str,
        evidence: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> str:

        async def _contribute():
            async with self._client as client:
                result = await client.collective.contribute(
                    domain=domain,
                    pattern=insight,
                    evidence=evidence,
                    tags=tags or [],
                )
                return result

        result = run_sync(_contribute())

        heuristic_id = result.get("heuristicId", "unknown")
        return f"Contributed insight to '{domain}'. Heuristic ID: {heuristic_id}"


class XacheCollectiveQueryTool(BaseTool):
    """
    Query collective intelligence.

    Learn from insights contributed by other agents in the community.
    """
    name: str = "xache_collective_query"
    description: str = (
        "Query the collective intelligence pool for insights from other agents. "
        "Use this when you need knowledge from the community."
    )
    args_schema: Type[BaseModel] = CollectiveQueryInput

    wallet_address: str
    private_key: str
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs):
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            timeout=self.timeout,
            debug=self.debug,
        )

    def _run(
        self,
        query: str,
        domain: Optional[str] = None,
        limit: int = 5
    ) -> str:

        async def _query():
            async with self._client as client:
                result = await client.collective.query(
                    query=query,
                    domain=domain,
                    limit=limit,
                )
                return result

        result = run_sync(_query())

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


class XacheReputationTool(BaseTool):
    """
    Check agent reputation.

    View your reputation score and ERC-8004 status.
    """
    name: str = "xache_check_reputation"
    description: str = (
        "Check your current reputation score and status. "
        "Higher reputation means lower costs and more trust."
    )

    wallet_address: str
    private_key: str
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs):
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            timeout=self.timeout,
            debug=self.debug,
        )

    def _run(self) -> str:

        async def _check():
            async with self._client as client:
                result = await client.reputation.get_score()
                return result

        result = run_sync(_check())

        score = result.get("score", 0)
        level = self._get_level(score)

        output = f"Reputation Score: {score:.2f}/1.00 ({level})\n"

        if result.get("erc8004AgentId"):
            output += f"ERC-8004: Enabled (Agent ID: {result['erc8004AgentId']})"
        else:
            output += "ERC-8004: Not enabled"

        return output

    def _get_level(self, score: float) -> str:
        if score >= 0.9:
            return "Elite"
        elif score >= 0.7:
            return "Trusted"
        elif score >= 0.5:
            return "Established"
        elif score >= 0.3:
            return "Developing"
        return "New"


def xache_tools(
    wallet_address: str,
    private_key: str,
    api_url: Optional[str] = None,
    chain: str = "base",
    include_memory: bool = True,
    include_collective: bool = True,
    include_reputation: bool = True,
    timeout: int = 30000,
    debug: bool = False,
) -> List[BaseTool]:
    """
    Create a set of Xache tools for CrewAI agents.

    Args:
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')
        include_memory: Include memory tools
        include_collective: Include collective intelligence tools
        include_reputation: Include reputation tool
        timeout: Request timeout in milliseconds (default: 30000)
        debug: Enable debug logging

    Returns:
        List of CrewAI tools

    Example:
        ```python
        from crewai import Agent
        from xache_crewai import xache_tools

        agent = Agent(
            role="Researcher",
            tools=xache_tools(
                wallet_address="0x...",
                private_key="0x..."
            )
        )
        ```
    """
    tools = []

    config = {
        "wallet_address": wallet_address,
        "private_key": private_key,
        "api_url": api_url,
        "chain": chain,
        "timeout": timeout,
        "debug": debug,
    }

    if include_memory:
        tools.extend([
            XacheMemoryStoreTool(**config),
            XacheMemoryRetrieveTool(**config),
        ])

    if include_collective:
        tools.extend([
            XacheCollectiveContributeTool(**config),
            XacheCollectiveQueryTool(**config),
        ])

    if include_reputation:
        tools.append(XacheReputationTool(**config))

    return tools
