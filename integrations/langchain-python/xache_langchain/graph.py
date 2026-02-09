"""
Xache Knowledge Graph for LangChain
Extract, query, and manage entities/relationships in a privacy-preserving knowledge graph
"""

from typing import List, Optional, Dict, Any, Sequence
from langchain.tools import BaseTool
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from pydantic import BaseModel, Field

from xache import XacheClient


# =============================================================================
# Input Schemas
# =============================================================================


class GraphExtractInput(BaseModel):
    """Input for graph extract tool"""

    trace: str = Field(description="The text/trace to extract entities from")
    context_hint: str = Field(
        default="", description="Domain hint (e.g., 'engineering', 'customer-support')"
    )


class GraphQueryInput(BaseModel):
    """Input for graph query tool"""

    start_entity: str = Field(description="Name of the entity to start from")
    depth: int = Field(default=2, description="Number of hops (default: 2)")


class GraphAskInput(BaseModel):
    """Input for graph ask tool"""

    question: str = Field(
        description="Natural language question about the knowledge graph"
    )


class GraphAddEntityInput(BaseModel):
    """Input for graph add entity tool"""

    name: str = Field(description="Entity name")
    type: str = Field(
        description="Entity type (person, organization, tool, concept, etc.)"
    )
    summary: str = Field(default="", description="Brief description")
    attributes: Dict[str, Any] = Field(
        default_factory=dict, description="Key-value attributes"
    )


class GraphAddRelationshipInput(BaseModel):
    """Input for graph add relationship tool"""

    from_entity: str = Field(description="Source entity name")
    to_entity: str = Field(description="Target entity name")
    type: str = Field(
        description="Relationship type (works_at, knows, uses, manages, etc.)"
    )
    description: str = Field(default="", description="Relationship description")


class GraphLoadInput(BaseModel):
    """Input for graph load tool"""

    entity_types: Optional[List[str]] = Field(
        default=None, description="Filter to specific entity types"
    )
    valid_at: Optional[str] = Field(
        default=None, description="Load graph as it existed at this time (ISO8601)"
    )


class GraphMergeEntitiesInput(BaseModel):
    """Input for graph merge entities tool"""

    source_name: str = Field(description="Entity to merge FROM (will be superseded)")
    target_name: str = Field(description="Entity to merge INTO (will be updated)")


class GraphEntityHistoryInput(BaseModel):
    """Input for graph entity history tool"""

    name: str = Field(description="Entity name to look up history for")


# =============================================================================
# Sync helper
# =============================================================================


def _run_sync(coro: Any) -> Any:
    """Run an async coroutine synchronously (handles nested loops)."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# =============================================================================
# Tools
# =============================================================================


class XacheGraphExtractTool(BaseTool):
    """
    LangChain tool for extracting entities/relationships from text.

    Example:
        ```python
        from xache_langchain import XacheGraphExtractTool

        extract_tool = XacheGraphExtractTool(
            wallet_address="0x...",
            private_key="0x...",
            llm_provider="anthropic",
            llm_api_key="sk-ant-...",
        )
        ```
    """

    name: str = "xache_graph_extract"
    description: str = (
        "Extract entities and relationships from text into the knowledge graph. "
        "Identifies people, organizations, tools, concepts and their connections."
    )
    args_schema: type = GraphExtractInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_endpoint: str = ""

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _build_llm_config(self) -> Dict[str, Any]:
        if self.llm_endpoint:
            return {"type": "endpoint", "url": self.llm_endpoint, "model": self.llm_model or None}
        elif self.llm_api_key and self.llm_provider:
            return {"type": "api-key", "provider": self.llm_provider, "apiKey": self.llm_api_key, "model": self.llm_model or None}
        else:
            return {"type": "xache-managed", "provider": "anthropic", "model": self.llm_model or None}

    def _run(self, trace: str, context_hint: str = "") -> str:
        async def _extract() -> Any:
            result = await self._client.graph.extract(
                trace=trace,
                llm_config=self._build_llm_config(),
                subject={"scope": "GLOBAL"},
                options={"contextHint": context_hint, "confidenceThreshold": 0.7},
            )
            return result

        result = _run_sync(_extract())
        entities = result.get("entities", [])
        relationships = result.get("relationships", [])

        if not entities and not relationships:
            return "No entities or relationships extracted."

        output = f"Extracted {len(entities)} entities, {len(relationships)} relationships.\n"
        for e in entities:
            output += f"  Entity: {e['name']} [{e['type']}]{'(new)' if e.get('isNew') else ''}\n"
        for r in relationships:
            output += f"  Rel: {r['from']} → {r['type']} → {r['to']}\n"
        return output

    async def _arun(self, trace: str, context_hint: str = "") -> str:
        result = await self._client.graph.extract(
            trace=trace,
            llm_config=self._build_llm_config(),
            subject={"scope": "GLOBAL"},
            options={"contextHint": context_hint, "confidenceThreshold": 0.7},
        )
        entities = result.get("entities", [])
        relationships = result.get("relationships", [])

        if not entities and not relationships:
            return "No entities or relationships extracted."

        output = f"Extracted {len(entities)} entities, {len(relationships)} relationships.\n"
        for e in entities:
            output += f"  Entity: {e['name']} [{e['type']}]{'(new)' if e.get('isNew') else ''}\n"
        for r in relationships:
            output += f"  Rel: {r['from']} → {r['type']} → {r['to']}\n"
        return output


class XacheGraphQueryTool(BaseTool):
    """
    LangChain tool for querying the knowledge graph around a specific entity.

    Example:
        ```python
        query_tool = XacheGraphQueryTool(
            wallet_address="0x...",
            private_key="0x...",
        )
        result = query_tool.run("John Smith")
        ```
    """

    name: str = "xache_graph_query"
    description: str = (
        "Query the knowledge graph around a specific entity. "
        "Returns connected entities and relationships."
    )
    args_schema: type = GraphQueryInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _run(self, start_entity: str, depth: int = 2) -> str:
        async def _query() -> Any:
            graph = await self._client.graph.query(
                subject={"scope": "GLOBAL"},
                start_entity=start_entity,
                depth=depth,
            )
            return graph.to_json()

        data = _run_sync(_query())
        entities = data.get("entities", [])
        relationships = data.get("relationships", [])

        if not entities:
            return f'No entities found connected to "{start_entity}".'

        output = f"Subgraph: {len(entities)} entities, {len(relationships)} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output

    async def _arun(self, start_entity: str, depth: int = 2) -> str:
        graph = await self._client.graph.query(
            subject={"scope": "GLOBAL"},
            start_entity=start_entity,
            depth=depth,
        )
        data = graph.to_json()
        entities = data.get("entities", [])
        relationships = data.get("relationships", [])

        if not entities:
            return f'No entities found connected to "{start_entity}".'

        output = f"Subgraph: {len(entities)} entities, {len(relationships)} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output


class XacheGraphAskTool(BaseTool):
    """
    LangChain tool for asking natural language questions about the knowledge graph.

    Example:
        ```python
        ask_tool = XacheGraphAskTool(
            wallet_address="0x...",
            private_key="0x...",
            llm_provider="anthropic",
            llm_api_key="sk-ant-...",
        )
        result = ask_tool.run("Who manages the engineering team?")
        ```
    """

    name: str = "xache_graph_ask"
    description: str = (
        "Ask a natural language question about the knowledge graph. "
        "Uses LLM to analyze entities/relationships and provide an answer."
    )
    args_schema: type = GraphAskInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_endpoint: str = ""

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _build_llm_config(self) -> Dict[str, Any]:
        if self.llm_endpoint:
            return {"type": "endpoint", "url": self.llm_endpoint, "model": self.llm_model or None}
        elif self.llm_api_key and self.llm_provider:
            return {"type": "api-key", "provider": self.llm_provider, "apiKey": self.llm_api_key, "model": self.llm_model or None}
        else:
            return {"type": "xache-managed", "provider": "anthropic", "model": self.llm_model or None}

    def _run(self, question: str) -> str:
        async def _ask() -> Any:
            return await self._client.graph.ask(
                subject={"scope": "GLOBAL"},
                question=question,
                llm_config=self._build_llm_config(),
            )

        answer = _run_sync(_ask())
        output = f"Answer: {answer['answer']}\nConfidence: {int(answer['confidence'] * 100)}%"
        sources = answer.get("sources", [])
        if sources:
            output += "\nSources: " + ", ".join(f"{s['name']} [{s['type']}]" for s in sources)
        return output

    async def _arun(self, question: str) -> str:
        answer = await self._client.graph.ask(
            subject={"scope": "GLOBAL"},
            question=question,
            llm_config=self._build_llm_config(),
        )
        output = f"Answer: {answer['answer']}\nConfidence: {int(answer['confidence'] * 100)}%"
        sources = answer.get("sources", [])
        if sources:
            output += "\nSources: " + ", ".join(f"{s['name']} [{s['type']}]" for s in sources)
        return output


class XacheGraphAddEntityTool(BaseTool):
    """LangChain tool for adding entities to the knowledge graph."""

    name: str = "xache_graph_add_entity"
    description: str = (
        "Add an entity to the knowledge graph. "
        "Creates a person, organization, tool, concept, or other entity type."
    )
    args_schema: type = GraphAddEntityInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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
        name: str,
        type: str,
        summary: str = "",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> str:
        async def _add() -> Any:
            return await self._client.graph.add_entity(
                subject={"scope": "GLOBAL"},
                name=name,
                type=type,
                summary=summary,
                attributes=attributes or {},
            )

        entity = _run_sync(_add())
        return f'Created entity "{entity["name"]}" [{entity["type"]}], key: {entity["key"]}'

    async def _arun(
        self,
        name: str,
        type: str,
        summary: str = "",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> str:
        entity = await self._client.graph.add_entity(
            subject={"scope": "GLOBAL"},
            name=name,
            type=type,
            summary=summary,
            attributes=attributes or {},
        )
        return f'Created entity "{entity["name"]}" [{entity["type"]}], key: {entity["key"]}'


class XacheGraphAddRelationshipTool(BaseTool):
    """LangChain tool for creating relationships between entities."""

    name: str = "xache_graph_add_relationship"
    description: str = (
        "Create a relationship between two entities in the knowledge graph."
    )
    args_schema: type = GraphAddRelationshipInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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
        from_entity: str,
        to_entity: str,
        type: str,
        description: str = "",
    ) -> str:
        async def _add() -> Any:
            return await self._client.graph.add_relationship(
                subject={"scope": "GLOBAL"},
                from_entity=from_entity,
                to_entity=to_entity,
                type=type,
                description=description,
            )

        rel = _run_sync(_add())
        return f"Created relationship: {from_entity} → {rel['type']} → {to_entity}"

    async def _arun(
        self,
        from_entity: str,
        to_entity: str,
        type: str,
        description: str = "",
    ) -> str:
        rel = await self._client.graph.add_relationship(
            subject={"scope": "GLOBAL"},
            from_entity=from_entity,
            to_entity=to_entity,
            type=type,
            description=description,
        )
        return f"Created relationship: {from_entity} → {rel['type']} → {to_entity}"


class XacheGraphLoadTool(BaseTool):
    """
    LangChain tool for loading the full knowledge graph.

    Example:
        ```python
        load_tool = XacheGraphLoadTool(
            wallet_address="0x...",
            private_key="0x...",
        )
        result = load_tool.run("")
        ```
    """

    name: str = "xache_graph_load"
    description: str = (
        "Load the full knowledge graph. Returns all entities and relationships. "
        "Optionally filter by entity type or load a historical snapshot."
    )
    args_schema: type = GraphLoadInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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
        entity_types: Optional[List[str]] = None,
        valid_at: Optional[str] = None,
    ) -> str:
        async def _load() -> Any:
            graph = await self._client.graph.load(
                subject={"scope": "GLOBAL"},
                entity_types=entity_types,
                valid_at=valid_at,
            )
            return graph.to_json()

        data = _run_sync(_load())
        entities = data.get("entities", [])
        relationships = data.get("relationships", [])

        if not entities:
            return "Knowledge graph is empty."

        output = f"Knowledge graph: {len(entities)} entities, {len(relationships)} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output

    async def _arun(
        self,
        entity_types: Optional[List[str]] = None,
        valid_at: Optional[str] = None,
    ) -> str:
        graph = await self._client.graph.load(
            subject={"scope": "GLOBAL"},
            entity_types=entity_types,
            valid_at=valid_at,
        )
        data = graph.to_json()
        entities = data.get("entities", [])
        relationships = data.get("relationships", [])

        if not entities:
            return "Knowledge graph is empty."

        output = f"Knowledge graph: {len(entities)} entities, {len(relationships)} relationships\n"
        for e in entities:
            output += f"  {e['name']} [{e['type']}]"
            if e.get("summary"):
                output += f" — {e['summary'][:80]}"
            output += "\n"
        return output


class XacheGraphMergeEntitiesTool(BaseTool):
    """
    LangChain tool for merging two entities in the knowledge graph.

    Example:
        ```python
        merge_tool = XacheGraphMergeEntitiesTool(
            wallet_address="0x...",
            private_key="0x...",
        )
        result = merge_tool.run({"source_name": "J. Smith", "target_name": "John Smith"})
        ```
    """

    name: str = "xache_graph_merge_entities"
    description: str = (
        "Merge two entities into one. The source entity is superseded and the target "
        "entity is updated with merged attributes. Relationships are transferred."
    )
    args_schema: type = GraphMergeEntitiesInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _run(self, source_name: str, target_name: str) -> str:
        async def _merge() -> Any:
            return await self._client.graph.merge_entities(
                subject={"scope": "GLOBAL"},
                source_name=source_name,
                target_name=target_name,
            )

        merged = _run_sync(_merge())
        return f'Merged "{source_name}" into "{target_name}". Result: {merged["name"]} [{merged["type"]}] (v{merged["version"]})'

    async def _arun(self, source_name: str, target_name: str) -> str:
        merged = await self._client.graph.merge_entities(
            subject={"scope": "GLOBAL"},
            source_name=source_name,
            target_name=target_name,
        )
        return f'Merged "{source_name}" into "{target_name}". Result: {merged["name"]} [{merged["type"]}] (v{merged["version"]})'


class XacheGraphEntityHistoryTool(BaseTool):
    """
    LangChain tool for getting the version history of an entity.

    Example:
        ```python
        history_tool = XacheGraphEntityHistoryTool(
            wallet_address="0x...",
            private_key="0x...",
        )
        result = history_tool.run("John Smith")
        ```
    """

    name: str = "xache_graph_entity_history"
    description: str = (
        "Get the full version history of an entity. "
        "Shows how the entity has changed over time."
    )
    args_schema: type = GraphEntityHistoryInput

    api_url: str = "https://api.xache.xyz"
    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    chain: str = "base"

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _run(self, name: str) -> str:
        async def _history() -> Any:
            return await self._client.graph.get_entity_history(
                subject={"scope": "GLOBAL"},
                name=name,
            )

        versions = _run_sync(_history())

        if not versions:
            return f'No history found for entity "{name}".'

        output = f'History for "{name}": {len(versions)} version(s)\n'
        for v in versions:
            output += f"  v{v['version']} — {v['name']} [{v['type']}]"
            if v.get("summary"):
                output += f" | {v['summary'][:80]}"
            output += f"\n    Valid: {v['validFrom']}"
            if v.get("validTo"):
                output += f" → {v['validTo']}"
            else:
                output += " → current"
            output += "\n"
        return output

    async def _arun(self, name: str) -> str:
        versions = await self._client.graph.get_entity_history(
            subject={"scope": "GLOBAL"},
            name=name,
        )

        if not versions:
            return f'No history found for entity "{name}".'

        output = f'History for "{name}": {len(versions)} version(s)\n'
        for v in versions:
            output += f"  v{v['version']} — {v['name']} [{v['type']}]"
            if v.get("summary"):
                output += f" | {v['summary'][:80]}"
            output += f"\n    Valid: {v['validFrom']}"
            if v.get("validTo"):
                output += f" → {v['validTo']}"
            else:
                output += " → current"
            output += "\n"
        return output


# =============================================================================
# Graph Retriever
# =============================================================================


class XacheGraphRetriever(BaseRetriever):
    """
    LangChain retriever that fetches documents from the Xache knowledge graph.
    Each entity becomes a Document with its name, type, and summary.

    Example:
        ```python
        from xache_langchain import XacheGraphRetriever

        retriever = XacheGraphRetriever(
            wallet_address="0x...",
            private_key="0x...",
            k=10,
        )

        docs = await retriever.aget_relevant_documents("engineering team")
        ```
    """

    wallet_address: str
    private_key: Optional[str] = None
    signer: Optional[Any] = None
    wallet_provider: Optional[Any] = None
    encryption_key: Optional[str] = None
    api_url: str = "https://api.xache.xyz"
    chain: str = "base"
    start_entity: Optional[str] = None
    depth: int = 2
    k: int = 10

    _client: Optional[XacheClient] = None

    class Config:
        arbitrary_types_allowed = True
        underscore_attrs_are_private = True

    def __init__(self, **kwargs: Any) -> None:
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

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        async def _fetch() -> List[Document]:
            return await self._aget_relevant_documents(query)

        return _run_sync(_fetch())

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        subject = {"scope": "GLOBAL"}

        if self.start_entity:
            graph = await self._client.graph.query(
                subject=subject,
                start_entity=self.start_entity,
                depth=self.depth,
            )
        else:
            graph = await self._client.graph.load(subject=subject)

        data = graph.to_json()
        query_lower = query.lower()

        scored = []
        for entity in data.get("entities", []):
            score = 0.0
            name_lower = entity.get("name", "").lower()
            summary_lower = entity.get("summary", "").lower()

            if query_lower in name_lower:
                score += 3
            if query_lower in summary_lower:
                score += 2

            for term in query_lower.split():
                if term in name_lower:
                    score += 1
                if term in summary_lower:
                    score += 0.5

            scored.append((entity, score))

        scored.sort(key=lambda x: x[1], reverse=True)

        docs = []
        for entity, _score in scored[: self.k]:
            parts = [f"Name: {entity['name']}", f"Type: {entity['type']}"]
            if entity.get("summary"):
                parts.append(f"Summary: {entity['summary']}")
            content = "\n".join(parts)

            docs.append(
                Document(
                    page_content=content,
                    metadata={
                        "source": "xache-graph",
                        "entity_key": entity.get("key", ""),
                        "entity_name": entity.get("name", ""),
                        "entity_type": entity.get("type", ""),
                    },
                )
            )

        return docs
