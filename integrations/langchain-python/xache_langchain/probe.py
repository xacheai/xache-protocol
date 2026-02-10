"""
Xache Memory Probe for LangChain
Zero-knowledge semantic memory search using cognitive fingerprints
"""

import json
import os
from typing import Any, Dict, List, Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from xache import XacheClient
from ._async_utils import run_sync


COGNITIVE_CATEGORIES = (
    'preference', 'fact', 'event', 'procedure', 'relationship',
    'observation', 'decision', 'goal', 'constraint', 'reference',
    'summary', 'handoff', 'pattern', 'feedback', 'unknown',
)


class ProbeInput(BaseModel):
    """Input for memory probe tool"""
    query: str = Field(description="What to search for in your memories")
    category: Optional[str] = Field(
        default=None,
        description="Filter by cognitive category (preference, fact, event, procedure, etc.)",
    )
    limit: int = Field(default=10, description="Maximum number of results (1-50)")


class XacheMemoryProbeTool(BaseTool):
    """
    LangChain tool for probing memories using cognitive fingerprints.

    Uses zero-knowledge semantic matching to find relevant memories
    without knowing exact storage keys. All fingerprint computation
    is client-side — the server never sees plaintext.

    Example:
        ```python
        from xache_langchain import XacheMemoryProbeTool

        probe_tool = XacheMemoryProbeTool(
            wallet_address="0x...",
            private_key="0x..."
        )

        # Use in agent
        tools = [probe_tool, ...]
        agent = initialize_agent(tools, llm)
        ```
    """

    name: str = "xache_memory_probe"
    description: str = (
        "Search your memories by topic using zero-knowledge semantic matching. "
        "Use this when you want to check what you already know about a topic "
        "without knowing exact storage keys. Returns matching memories with decrypted data."
    )
    args_schema: type = ProbeInput

    # Xache configuration
    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True)
    signer: Optional[Any] = Field(default=None, exclude=True)
    wallet_provider: Optional[Any] = Field(default=None, exclude=True)
    encryption_key: Optional[str] = Field(default=None, exclude=True)
    chain: str = "base"

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any):
        if "api_url" not in kwargs or kwargs["api_url"] is None:
            kwargs["api_url"] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
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

    def _run(self, query: str, category: Optional[str] = None, limit: int = 10) -> str:
        async def _probe() -> Dict[str, Any]:
            async with self._client as client:
                return await client.memory.probe(
                    query=query,
                    category=category,
                    limit=limit,
                )

        result = run_sync(_probe())
        matches = result.get("matches", [])

        if not matches:
            return "No matching memories found for this query."

        total = result.get("total", len(matches))
        output = f"Found {len(matches)} matching memories (total: {total}):\n"

        for i, match in enumerate(matches):
            data = match.get("data", "")
            if isinstance(data, str):
                data = data[:300]
            else:
                data = json.dumps(data)[:300]
            cat = match.get("category", "unknown")
            key = match.get("storageKey", "")
            output += f"\n{i + 1}. [{cat}] {data} (key: {key})"

        return output
