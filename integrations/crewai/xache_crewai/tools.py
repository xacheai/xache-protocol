"""
Xache Tools for CrewAI
Provide memory, collective intelligence, and reputation capabilities to agents
"""

import os
from typing import Any, Dict, List, Optional, Type
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


class MemoryProbeInput(BaseModel):
    """Input for memory probe tool"""
    query: str = Field(description="What to search for in your memories")
    category: Optional[str] = Field(default=None, description="Filter by cognitive category")
    limit: int = Field(default=10, description="Maximum number of results (1-50)")


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
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
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
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
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
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
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
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
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


class XacheMemoryProbeTool(BaseTool):
    """
    Probe memories using zero-knowledge semantic matching.

    Use cognitive fingerprints to find relevant memories without
    knowing exact storage keys. All fingerprint computation is
    client-side — the server never sees plaintext.
    """
    name: str = "xache_memory_probe"
    description: str = (
        "Search your memories by topic using zero-knowledge semantic matching. "
        "Use this when you want to check what you already know about a topic "
        "without knowing exact storage keys."
    )
    args_schema: Type[BaseModel] = MemoryProbeInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, query: str, category: Optional[str] = None, limit: int = 10) -> str:
        import json as _json

        async def _probe() -> Any:
            async with self._client as client:
                return await client.memory.probe(
                    query=query, category=category, limit=limit,
                )
        result = run_sync(_probe())
        matches = result.get("matches", [])

        if not matches:
            return "No matching memories found for this query."

        total = result.get("total", len(matches))
        output = f"Found {len(matches)} matching memories (total: {total}):\n"
        for i, m in enumerate(matches, 1):
            data = m.get("data", "")
            if isinstance(data, str):
                data = data[:300]
            else:
                data = _json.dumps(data)[:300]
            output += f"\n{i}. [{m.get('category', 'unknown')}] {data}"
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
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
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
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
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
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
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
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
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
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
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
            signer=self.signer,
            wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
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


# =============================================================================
# Knowledge Graph Tools
# =============================================================================


class GraphExtractInput(BaseModel):
    """Input for graph extract tool"""
    trace: str = Field(description="Text/trace to extract entities from")
    context_hint: str = Field(default="", description="Domain hint for extraction")


class GraphQueryInput(BaseModel):
    """Input for graph query tool"""
    start_entity: str = Field(description="Name of entity to start from")
    depth: int = Field(default=2, description="Number of hops (default: 2)")


class GraphAskInput(BaseModel):
    """Input for graph ask tool"""
    question: str = Field(description="Natural language question about the knowledge graph")


class GraphAddEntityInput(BaseModel):
    """Input for graph add entity tool"""
    name: str = Field(description="Entity name")
    type: str = Field(description="Entity type (person, organization, tool, concept, etc.)")
    summary: str = Field(default="", description="Brief description")


class GraphAddRelationshipInput(BaseModel):
    """Input for graph add relationship tool"""
    from_entity: str = Field(description="Source entity name")
    to_entity: str = Field(description="Target entity name")
    type: str = Field(description="Relationship type (works_at, knows, uses, manages, etc.)")
    description: str = Field(default="", description="Relationship description")


class GraphLoadInput(BaseModel):
    """Input for graph load tool"""
    entity_types: Optional[List[str]] = Field(default=None, description="Filter to specific entity types")
    valid_at: Optional[str] = Field(default=None, description="Load graph as it existed at this time (ISO8601)")


class GraphMergeEntitiesInput(BaseModel):
    """Input for graph merge entities tool"""
    source_name: str = Field(description="Entity to merge FROM (will be superseded)")
    target_name: str = Field(description="Entity to merge INTO (will be updated)")


class GraphEntityHistoryInput(BaseModel):
    """Input for graph entity history tool"""
    name: str = Field(description="Entity name to look up history for")


class ExtractionInput(BaseModel):
    """Input for extraction tool"""
    trace: str = Field(description="Text/conversation to extract memories from")
    auto_store: bool = Field(default=False, description="Automatically store extracted memories")
    context_hint: str = Field(default="", description="Domain hint for extraction")


class XacheGraphExtractTool(BaseTool):
    """Extract entities/relationships from text into the knowledge graph."""
    name: str = "xache_graph_extract"
    description: str = (
        "Extract entities and relationships from text into the knowledge graph. "
        "Identifies people, organizations, tools, concepts and their connections."
    )
    args_schema: Type[BaseModel] = GraphExtractInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _build_llm_config(self) -> Dict[str, Any]:
        if self.llm_api_key and self.llm_provider:
            return {"type": "api-key", "provider": self.llm_provider, "apiKey": self.llm_api_key, "model": self.llm_model or None}
        return {"type": "xache-managed", "provider": "anthropic", "model": self.llm_model or None}

    def _run(self, trace: str, context_hint: str = "") -> str:
        async def _extract() -> Any:
            async with self._client as client:
                return await client.graph.extract(
                    trace=trace, llm_config=self._build_llm_config(),
                    subject={"scope": "GLOBAL"},
                    options={"contextHint": context_hint, "confidenceThreshold": 0.7},
                )
        result = run_sync(_extract())
        entities = result.get("entities", [])
        rels = result.get("relationships", [])
        if not entities and not rels:
            return "No entities or relationships extracted."
        output = f"Extracted {len(entities)} entities, {len(rels)} relationships.\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]{'(new)' if e.get('isNew') else ''}\n"
        for r in rels:
            output += f"  {r['from']} → {r['type']} → {r['to']}\n"
        return output


class XacheGraphQueryTool(BaseTool):
    """Query the knowledge graph around a specific entity."""
    name: str = "xache_graph_query"
    description: str = (
        "Query the knowledge graph around a specific entity. "
        "Returns connected entities and relationships."
    )
    args_schema: Type[BaseModel] = GraphQueryInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, start_entity: str, depth: int = 2) -> str:
        async def _query() -> Any:
            async with self._client as client:
                graph = await client.graph.query(
                    subject={"scope": "GLOBAL"}, start_entity=start_entity, depth=depth,
                )
                return graph.to_json()
        data = run_sync(_query())
        entities = data.get("entities", [])
        if not entities:
            return f'No entities found connected to "{start_entity}".'
        output = f"Subgraph: {len(entities)} entities, {len(data.get('relationships', []))} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output


class XacheGraphAskTool(BaseTool):
    """Ask a natural language question about the knowledge graph."""
    name: str = "xache_graph_ask"
    description: str = (
        "Ask a natural language question about the knowledge graph. "
        "Uses LLM to analyze entities/relationships and provide an answer."
    )
    args_schema: Type[BaseModel] = GraphAskInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _build_llm_config(self) -> Dict[str, Any]:
        if self.llm_api_key and self.llm_provider:
            return {"type": "api-key", "provider": self.llm_provider, "apiKey": self.llm_api_key, "model": self.llm_model or None}
        return {"type": "xache-managed", "provider": "anthropic", "model": self.llm_model or None}

    def _run(self, question: str) -> str:
        async def _ask() -> Any:
            async with self._client as client:
                return await client.graph.ask(
                    subject={"scope": "GLOBAL"}, question=question,
                    llm_config=self._build_llm_config(),
                )
        answer = run_sync(_ask())
        output = f"Answer: {answer['answer']}\nConfidence: {int(answer['confidence'] * 100)}%"
        sources = answer.get("sources", [])
        if sources:
            output += "\nSources: " + ", ".join(f"{s['name']} [{s['type']}]" for s in sources)
        return output


class XacheGraphAddEntityTool(BaseTool):
    """Add an entity to the knowledge graph."""
    name: str = "xache_graph_add_entity"
    description: str = "Add an entity to the knowledge graph (person, organization, tool, concept, etc.)."
    args_schema: Type[BaseModel] = GraphAddEntityInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, name: str, type: str, summary: str = "") -> str:
        async def _add() -> Any:
            async with self._client as client:
                return await client.graph.add_entity(
                    subject={"scope": "GLOBAL"}, name=name, type=type, summary=summary,
                )
        entity = run_sync(_add())
        return f'Created entity "{entity["name"]}" [{entity["type"]}], key: {entity["key"]}'


class XacheGraphAddRelationshipTool(BaseTool):
    """Create a relationship between two entities in the knowledge graph."""
    name: str = "xache_graph_add_relationship"
    description: str = "Create a relationship between two entities in the knowledge graph."
    args_schema: Type[BaseModel] = GraphAddRelationshipInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, from_entity: str, to_entity: str, type: str, description: str = "") -> str:
        async def _add() -> Any:
            async with self._client as client:
                return await client.graph.add_relationship(
                    subject={"scope": "GLOBAL"}, from_entity=from_entity,
                    to_entity=to_entity, type=type, description=description,
                )
        rel = run_sync(_add())
        return f"Created relationship: {from_entity} → {rel['type']} → {to_entity}"


class XacheGraphLoadTool(BaseTool):
    """Load the full knowledge graph."""
    name: str = "xache_graph_load"
    description: str = (
        "Load the full knowledge graph. Returns all entities and relationships. "
        "Optionally filter by entity type or load a historical snapshot."
    )
    args_schema: Type[BaseModel] = GraphLoadInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, entity_types: Optional[List[str]] = None, valid_at: Optional[str] = None) -> str:
        async def _load() -> Any:
            async with self._client as client:
                graph = await client.graph.load(
                    subject={"scope": "GLOBAL"}, entity_types=entity_types, valid_at=valid_at,
                )
                return graph.to_json()
        data = run_sync(_load())
        entities = data.get("entities", [])
        if not entities:
            return "Knowledge graph is empty."
        output = f"Knowledge graph: {len(entities)} entities, {len(data.get('relationships', []))} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output


class XacheGraphMergeEntitiesTool(BaseTool):
    """Merge two entities into one in the knowledge graph."""
    name: str = "xache_graph_merge_entities"
    description: str = (
        "Merge two entities into one. The source entity is superseded and the target "
        "entity is updated with merged attributes. Relationships are transferred."
    )
    args_schema: Type[BaseModel] = GraphMergeEntitiesInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, source_name: str, target_name: str) -> str:
        async def _merge() -> Any:
            async with self._client as client:
                return await client.graph.merge_entities(
                    subject={"scope": "GLOBAL"}, source_name=source_name, target_name=target_name,
                )
        merged = run_sync(_merge())
        return f'Merged "{source_name}" into "{target_name}". Result: {merged["name"]} [{merged["type"]}] (v{merged["version"]})'


class XacheGraphEntityHistoryTool(BaseTool):
    """Get the version history of an entity."""
    name: str = "xache_graph_entity_history"
    description: str = (
        "Get the full version history of an entity. "
        "Shows how the entity has changed over time."
    )
    args_schema: Type[BaseModel] = GraphEntityHistoryInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, name: str) -> str:
        async def _history() -> Any:
            async with self._client as client:
                return await client.graph.get_entity_history(
                    subject={"scope": "GLOBAL"}, name=name,
                )
        versions = run_sync(_history())
        if not versions:
            return f'No history found for entity "{name}".'
        output = f'History for "{name}": {len(versions)} version(s)\n'
        for v in versions:
            output += f"  v{v['version']} — {v['name']} [{v['type']}]"
            if v.get("summary"):
                output += f" | {v['summary'][:80]}"
            output += f"\n    Valid: {v['validFrom']}{' → ' + v['validTo'] if v.get('validTo') else ' → current'}\n"
        return output


class XacheExtractionTool(BaseTool):
    """Extract memories from conversations using Xache's LLM-powered extraction."""
    name: str = "xache_extract_memories"
    description: str = (
        "Extract valuable memories and learnings from conversation text. "
        "Uses LLM to identify key information worth remembering."
    )
    args_schema: Type[BaseModel] = ExtractionInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer (alternative to private_key)")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider for lazy signer resolution")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key for use with external signers")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _build_llm_config(self) -> Dict[str, Any]:
        if self.llm_api_key and self.llm_provider:
            return {"type": "api-key", "provider": self.llm_provider, "apiKey": self.llm_api_key, "model": self.llm_model or None}
        return {"type": "xache-managed", "provider": "anthropic", "model": self.llm_model or None}

    def _run(self, trace: str, auto_store: bool = False, context_hint: str = "") -> str:
        async def _extract() -> Any:
            async with self._client as client:
                return await client.extraction.extract(
                    trace=trace, llm_config=self._build_llm_config(),
                    options={"autoStore": auto_store, "context": {"hint": context_hint} if context_hint else None},
                )
        result = run_sync(_extract())
        memories = result.get("memories", [])
        if not memories:
            return "No memories extracted."
        output = f"Extracted {len(memories)} memories:\n"
        for i, m in enumerate(memories, 1):
            content = m.get("content", "")[:100]
            output += f"  {i}. {content}\n"
        if result.get("receiptId"):
            output += f"Receipt: {result['receiptId']}"
        return output


# =============================================================================
# Ephemeral Context Tools
# =============================================================================


class EphemeralCreateSessionInput(BaseModel):
    """Input for ephemeral create session tool"""
    ttl_seconds: int = Field(default=3600, description="Session TTL in seconds (default: 3600)")
    max_windows: int = Field(default=5, description="Maximum renewal windows (default: 5)")


class EphemeralWriteSlotInput(BaseModel):
    """Input for ephemeral write slot tool"""
    session_key: str = Field(description="The ephemeral session key")
    slot: str = Field(description="Slot name (conversation, facts, tasks, cache, scratch, handoff)")
    data: Dict = Field(description="Data to write to the slot")


class EphemeralReadSlotInput(BaseModel):
    """Input for ephemeral read slot tool"""
    session_key: str = Field(description="The ephemeral session key")
    slot: str = Field(description="Slot name (conversation, facts, tasks, cache, scratch, handoff)")


class EphemeralPromoteInput(BaseModel):
    """Input for ephemeral promote tool"""
    session_key: str = Field(description="The ephemeral session key to promote")


class XacheEphemeralCreateSessionTool(BaseTool):
    """Create a new ephemeral working memory session."""
    name: str = "xache_ephemeral_create_session"
    description: str = (
        "Create a new ephemeral working memory session. "
        "Returns a session key for storing temporary data in slots."
    )
    args_schema: Type[BaseModel] = EphemeralCreateSessionInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, ttl_seconds: int = 3600, max_windows: int = 5) -> str:
        async def _create() -> Any:
            async with self._client as client:
                return await client.ephemeral.create_session(
                    ttl_seconds=ttl_seconds, max_windows=max_windows,
                )
        session = run_sync(_create())
        return (
            f"Created ephemeral session.\n"
            f"Session Key: {session.session_key}\n"
            f"Status: {session.status}\n"
            f"TTL: {session.ttl_seconds}s\n"
            f"Expires: {session.expires_at}"
        )


class XacheEphemeralWriteSlotTool(BaseTool):
    """Write data to an ephemeral session slot."""
    name: str = "xache_ephemeral_write_slot"
    description: str = (
        "Write data to an ephemeral session slot. "
        "Slots: conversation, facts, tasks, cache, scratch, handoff."
    )
    args_schema: Type[BaseModel] = EphemeralWriteSlotInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, session_key: str, slot: str, data: Dict = None) -> str:
        async def _write() -> Any:
            async with self._client as client:
                await client.ephemeral.write_slot(session_key, slot, data or {})
        run_sync(_write())
        return f'Wrote data to slot "{slot}" in session {session_key[:12]}...'


class XacheEphemeralReadSlotTool(BaseTool):
    """Read data from an ephemeral session slot."""
    name: str = "xache_ephemeral_read_slot"
    description: str = (
        "Read data from an ephemeral session slot. "
        "Slots: conversation, facts, tasks, cache, scratch, handoff."
    )
    args_schema: Type[BaseModel] = EphemeralReadSlotInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, session_key: str, slot: str) -> str:
        import json

        async def _read() -> Any:
            async with self._client as client:
                return await client.ephemeral.read_slot(session_key, slot)
        data = run_sync(_read())
        return json.dumps(data, indent=2)


class XacheEphemeralPromoteTool(BaseTool):
    """Promote an ephemeral session to persistent memory."""
    name: str = "xache_ephemeral_promote"
    description: str = (
        "Promote an ephemeral session to persistent memory. "
        "Extracts valuable data from slots and stores as permanent memories."
    )
    args_schema: Type[BaseModel] = EphemeralPromoteInput

    wallet_address: str
    private_key: Optional[str] = Field(default=None, exclude=True, description="Private key for signing")
    signer: Optional[Any] = Field(default=None, exclude=True, description="External signer")
    wallet_provider: Optional[Any] = Field(default=None, exclude=True, description="Wallet provider")
    encryption_key: Optional[str] = Field(default=None, exclude=True, description="Encryption key")
    api_url: Optional[str] = None
    chain: str = "base"
    timeout: int = 30000
    debug: bool = False

    _client: Optional[XacheClient] = None

    def __init__(self, **kwargs: Any) -> None:
        if 'api_url' not in kwargs or kwargs['api_url'] is None:
            kwargs['api_url'] = os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        super().__init__(**kwargs)
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        did = f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"
        self._client = XacheClient(
            api_url=self.api_url, did=did, private_key=self.private_key,
            signer=self.signer, wallet_provider=self.wallet_provider,
            encryption_key=self.encryption_key,
            timeout=self.timeout, debug=self.debug,
        )

    def _run(self, session_key: str) -> str:
        async def _promote() -> Any:
            async with self._client as client:
                return await client.ephemeral.promote_session(session_key)
        result = run_sync(_promote())
        output = f"Promoted session {session_key[:12]}...\n"
        output += f"Memories created: {result.memories_created}\n"
        if result.memory_ids:
            output += f"Memory IDs: {', '.join(result.memory_ids)}\n"
        if result.receipt_id:
            output += f"Receipt: {result.receipt_id}"
        return output


def xache_tools(
    wallet_address: str,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: str = "base",
    include_memory: bool = True,
    include_collective: bool = True,
    include_reputation: bool = True,
    include_graph: bool = True,
    include_extraction: bool = True,
    include_ephemeral: bool = True,
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    llm_model: str = "",
    timeout: int = 30000,
    debug: bool = False,
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> List[BaseTool]:
    """
    Create a set of Xache tools for CrewAI agents.

    Args:
        wallet_address: Wallet address for authentication
        private_key: Private key for signing (optional if signer/wallet_provider provided)
        api_url: Xache API URL
        chain: Chain to use ('base' or 'solana')
        include_memory: Include memory tools
        include_collective: Include collective intelligence tools
        include_reputation: Include reputation tool
        include_graph: Include knowledge graph tools
        include_extraction: Include memory extraction tool
        llm_provider: LLM provider for graph extract/ask/extraction
        llm_api_key: LLM API key
        llm_model: LLM model override
        timeout: Request timeout in milliseconds (default: 30000)
        debug: Enable debug logging
        signer: External signer (alternative to private_key)
        wallet_provider: Wallet provider for lazy signer resolution
        encryption_key: Encryption key for use with external signers

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
                private_key="0x...",
                llm_provider="anthropic",
                llm_api_key="sk-ant-...",
            )
        )
        ```
    """
    tools: List[BaseTool] = []

    config: Dict[str, Any] = {
        "wallet_address": wallet_address,
        "private_key": private_key,
        "signer": signer,
        "wallet_provider": wallet_provider,
        "encryption_key": encryption_key,
        "api_url": api_url,
        "chain": chain,
        "timeout": timeout,
        "debug": debug,
    }

    graph_config: Dict[str, Any] = {
        **config,
        "llm_provider": llm_provider,
        "llm_api_key": llm_api_key,
        "llm_model": llm_model,
    }

    if include_memory:
        tools.extend([
            XacheMemoryStoreTool(**config),
            XacheMemoryRetrieveTool(**config),
            XacheMemoryProbeTool(**config),
        ])

    if include_collective:
        tools.extend([
            XacheCollectiveContributeTool(**config),
            XacheCollectiveQueryTool(**config),
        ])

    if include_reputation:
        tools.append(XacheReputationTool(**config))

    if include_graph:
        tools.extend([
            XacheGraphExtractTool(**graph_config),
            XacheGraphLoadTool(**config),
            XacheGraphQueryTool(**config),
            XacheGraphAskTool(**graph_config),
            XacheGraphAddEntityTool(**config),
            XacheGraphAddRelationshipTool(**config),
            XacheGraphMergeEntitiesTool(**config),
            XacheGraphEntityHistoryTool(**config),
        ])

    if include_extraction:
        tools.append(XacheExtractionTool(**graph_config))

    if include_ephemeral:
        tools.extend([
            XacheEphemeralCreateSessionTool(**config),
            XacheEphemeralWriteSlotTool(**config),
            XacheEphemeralReadSlotTool(**config),
            XacheEphemeralPromoteTool(**config),
        ])

    return tools
