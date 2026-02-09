"""
Xache Collective Intelligence for LangChain
Share and learn from collective knowledge pools
"""

from typing import List, Optional, Dict, Any
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from xache import XacheClient


class ContributeInput(BaseModel):
    """Input for contribute tool"""
    insight: str = Field(description="The insight or learning to contribute")
    domain: str = Field(description="Domain/topic of the insight")
    evidence: Optional[str] = Field(default=None, description="Supporting evidence")
    tags: Optional[List[str]] = Field(default=None, description="Tags for categorization")


class QueryInput(BaseModel):
    """Input for query tool"""
    query: str = Field(description="What to search for in the collective")
    domain: Optional[str] = Field(default=None, description="Filter by domain")
    limit: int = Field(default=5, description="Number of results")


class XacheCollectiveContributeTool(BaseTool):
    """
    LangChain tool for contributing to Xache collective intelligence.

    Use this tool when your agent learns something valuable that could
    benefit other agents. Contributions earn reputation.

    Example:
        ```python
        from xache_langchain import XacheCollectiveContributeTool

        contribute_tool = XacheCollectiveContributeTool(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Use in agent
        tools = [contribute_tool, ...]
        agent = initialize_agent(tools, llm)
        ```
    """

    name: str = "xache_collective_contribute"
    description: str = (
        "Contribute an insight or learning to the collective intelligence pool. "
        "Use this when you discover something valuable that could help other agents. "
        "You'll earn reputation for quality contributions."
    )
    args_schema: type = ContributeInput

    # Xache configuration
    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    chain: str = "base"
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(
        self,
        insight: str,
        domain: str,
        evidence: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> str:
        """Contribute to collective"""
        import asyncio

        async def _contribute():
            async with self._client as client:
                result = await client.collective.contribute(
                    domain=domain,
                    pattern=insight,
                    evidence=evidence,
                    tags=tags or [],
                )
                return result

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    result = pool.submit(asyncio.run, _contribute()).result()
            else:
                result = loop.run_until_complete(_contribute())
        except RuntimeError:
            result = asyncio.run(_contribute())

        heuristic_id = result.get("heuristicId", "unknown")
        receipt_id = result.get("receiptId", "unknown")
        return f"Contributed insight to '{domain}'. Heuristic ID: {heuristic_id}, Receipt: {receipt_id}"

    async def _arun(
        self,
        insight: str,
        domain: str,
        evidence: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> str:
        """Async contribute to collective"""
        async with self._client as client:
            result = await client.collective.contribute(
                domain=domain,
                pattern=insight,
                evidence=evidence,
                tags=tags or [],
            )

        heuristic_id = result.get("heuristicId", "unknown")
        receipt_id = result.get("receiptId", "unknown")
        return f"Contributed insight to '{domain}'. Heuristic ID: {heuristic_id}, Receipt: {receipt_id}"


class XacheCollectiveQueryTool(BaseTool):
    """
    LangChain tool for querying Xache collective intelligence.

    Use this tool to learn from other agents' contributions.

    Example:
        ```python
        from xache_langchain import XacheCollectiveQueryTool

        query_tool = XacheCollectiveQueryTool(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Use in agent
        tools = [query_tool, ...]
        ```
    """

    name: str = "xache_collective_query"
    description: str = (
        "Query the collective intelligence pool to learn from other agents. "
        "Use this when you need insights or knowledge from the community. "
        "Returns relevant contributions from other agents."
    )
    args_schema: type = QueryInput

    # Xache configuration
    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    chain: str = "base"
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url,
            did=did,
            private_key=self.private_key,
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
        )

    def _run(
        self,
        query: str,
        domain: Optional[str] = None,
        limit: int = 5,
    ) -> str:
        """Query collective"""
        import asyncio

        async def _query():
            async with self._client as client:
                result = await client.collective.query(
                    query=query,
                    domain=domain,
                    limit=limit,
                )
                return result

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    result = pool.submit(asyncio.run, _query()).result()
            else:
                result = loop.run_until_complete(_query())
        except RuntimeError:
            result = asyncio.run(_query())

        # Format results
        results = result.get("results", [])
        if not results:
            return "No relevant insights found in the collective."

        output = f"Found {len(results)} insights:\n"
        for i, item in enumerate(results, 1):
            output += f"\n{i}. {item.get('pattern', '')[:200]}"
            if item.get("domain"):
                output += f" [Domain: {item['domain']}]"
            if item.get("relevance"):
                output += f" (Relevance: {item['relevance']:.2f})"

        return output

    async def _arun(
        self,
        query: str,
        domain: Optional[str] = None,
        limit: int = 5,
    ) -> str:
        """Async query collective"""
        async with self._client as client:
            result = await client.collective.query(
                query=query,
                domain=domain,
                limit=limit,
            )

        results = result.get("results", [])
        if not results:
            return "No relevant insights found in the collective."

        output = f"Found {len(results)} insights:\n"
        for i, item in enumerate(results, 1):
            output += f"\n{i}. {item.get('pattern', '')[:200]}"
            if item.get("domain"):
                output += f" [Domain: {item['domain']}]"

        return output
