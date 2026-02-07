"""
Graph Service — Knowledge graph built on encrypted memory primitives

Orchestrates extraction, storage, retrieval, and graph construction.
The server stores encrypted entities/relationships as memories.
All graph logic (traversal, merging, resolution) happens here client-side.
"""

import json
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from ..graph import Entity, Graph, GraphAnswer, GraphExtractionResult, Relationship

# Graph context constants
GRAPH_ENTITY = "xache.graph.entity"
GRAPH_RELATIONSHIP = "xache.graph.relationship"


def _derive_entity_key(encryption_key: bytes, entity_name: str) -> str:
    """
    Derive an HMAC entity key from a raw entity name.
    Uses HMAC-SHA256 with domain separator 'xache:entity:v1'.
    Names are normalized (lowercase, trimmed) before HMAC.

    Returns 64-character hex string.
    """
    normalized = entity_name.strip().lower()
    domain = "xache:entity:v1"
    message = f"{domain}:{normalized}".encode("utf-8")

    # Derive HMAC key from encryption key using BLAKE2b
    hmac_key = hashlib.blake2b(encryption_key, digest_size=32).digest()
    mac = hmac.new(hmac_key, message, hashlib.sha256)
    return mac.hexdigest()


class GraphService:
    """
    Privacy-preserving knowledge graph service.

    Entities and relationships are stored as standard encrypted memories
    with HMAC-derived keys in plaintext metadata for graph structure discovery.

    Example:
        ```python
        async with XacheClient(...) as client:
            # Add entities
            alice = await client.graph.add_entity(
                name="Alice Chen",
                entity_type="person",
                summary="CTO of Acme Corp",
                subject=subject_ctx,
            )

            acme = await client.graph.add_entity(
                name="Acme Corp",
                entity_type="organization",
                summary="Tech company",
                subject=subject_ctx,
            )

            # Add relationship
            await client.graph.add_relationship(
                from_name="Alice Chen",
                to_name="Acme Corp",
                rel_type="works_at",
                description="Alice is CTO at Acme Corp",
                subject=subject_ctx,
            )

            # Load and traverse
            graph = await client.graph.load(subject=subject_ctx)
            neighbors = graph.neighbors("Alice Chen")
        ```
    """

    def __init__(self, client: Any) -> None:
        self.client = client

    async def _get_enc_key(self) -> bytes:
        """Get encryption key from memory service."""
        key: bytes = await self.client.memory.get_current_encryption_key()
        return key

    async def derive_entity_key(self, name: str) -> str:
        """Derive an HMAC entity key from a raw entity name."""
        enc_key = await self._get_enc_key()
        return _derive_entity_key(enc_key, name)

    # ============================================================
    # Core Methods
    # ============================================================

    async def load(
        self,
        subject: Optional[Dict[str, Any]] = None,
        entity_types: Optional[List[str]] = None,
        valid_at: Optional[str] = None,
    ) -> Graph:
        """
        Load the full knowledge graph for a subject.

        Args:
            subject: Subject context dict (subject_id, scope, etc.)
            entity_types: Filter to specific entity types
            valid_at: ISO8601 point-in-time query

        Returns:
            Graph object with traversal methods
        """
        # Build subject filter kwargs
        subj_kwargs: Dict[str, Any] = {}
        if subject:
            if subject.get("subject_id"):
                subj_kwargs["subject_id"] = subject["subject_id"]
            if subject.get("scope"):
                subj_kwargs["scope"] = subject["scope"]
            if subject.get("segment_id"):
                subj_kwargs["segment_id"] = subject["segment_id"]
            if subject.get("tenant_id"):
                subj_kwargs["tenant_id"] = subject["tenant_id"]

        # 1. List entities (FREE) — separate call with context filter
        entity_list = await self.client.memory.list(
            context=GRAPH_ENTITY,
            limit=100,
            **subj_kwargs,
        )
        entity_items = entity_list.memories

        # 2. List relationships (FREE) — separate call with context filter
        rel_list = await self.client.memory.list(
            context=GRAPH_RELATIONSHIP,
            limit=100,
            **subj_kwargs,
        )
        rel_items = rel_list.memories

        # Filter by entity types via tags
        if entity_types:
            entity_items = [
                m for m in entity_items
                if any(t.startswith("et:") and t[3:] in entity_types for t in (m.tags or []))
            ]

        # Filter by point-in-time validity
        if valid_at:
            from datetime import datetime
            at_date = datetime.fromisoformat(valid_at.replace("Z", "+00:00"))
            filtered = []
            for m in entity_items:
                meta = m.metadata or {}
                vf = meta.get("validFrom")
                vt = meta.get("validTo")
                from_dt = datetime.fromisoformat(vf.replace("Z", "+00:00")) if vf else datetime.min
                to_dt = datetime.fromisoformat(vt.replace("Z", "+00:00")) if vt else datetime.max
                if from_dt <= at_date <= to_dt:
                    filtered.append(m)
            entity_items = filtered

        # 3. Retrieve entity payloads in batch
        entities: List[Entity] = []
        if entity_items:
            entity_keys = [m.storage_key for m in entity_items]
            enc_key = await self._get_enc_key()

            batch_resp = await self.client.request_with_payment(
                "POST",
                "/v1/memory/retrieve/batch",
                {"storageKeys": entity_keys},
            )

            if batch_resp.success and batch_resp.data:
                for i, result in enumerate(batch_resp.data.get("results", [])):
                    if result.get("error") or not result.get("encryptedPayload"):
                        continue

                    data = self.client.memory._decrypt_data(
                        result["encryptedPayload"], enc_key
                    )

                    list_item = entity_items[result.get("index", i)]
                    meta = list_item.metadata or {}

                    entities.append(Entity(
                        key=str(meta.get("entityKey", "")),
                        name=str(data.get("name", "")),
                        type=str(meta.get("entityType", "concept")),
                        summary=str(data.get("summary", "")),
                        attributes=data.get("attributes", {}),
                        storage_key=result.get("storageKey", list_item.storage_key),
                        valid_from=str(meta.get("validFrom", list_item.created_at)),
                        valid_to=meta.get("validTo"),
                        version=int(meta.get("version", 1)),
                    ))

        # 4. Retrieve relationship payloads in batch
        relationships: List[Relationship] = []
        if rel_items:
            rel_keys = [m.storage_key for m in rel_items]
            enc_key = await self._get_enc_key()

            batch_resp = await self.client.request_with_payment(
                "POST",
                "/v1/memory/retrieve/batch",
                {"storageKeys": rel_keys},
            )

            if batch_resp.success and batch_resp.data:
                for i, result in enumerate(batch_resp.data.get("results", [])):
                    if result.get("error") or not result.get("encryptedPayload"):
                        continue

                    data = self.client.memory._decrypt_data(
                        result["encryptedPayload"], enc_key
                    )

                    list_item = rel_items[result.get("index", i)]
                    meta = list_item.metadata or {}

                    relationships.append(Relationship(
                        from_key=str(meta.get("fromEntityKey", "")),
                        to_key=str(meta.get("toEntityKey", "")),
                        type=str(meta.get("relationType", "related_to")),
                        description=str(data.get("description", "")),
                        attributes=data.get("attributes", {}),
                        storage_key=result.get("storageKey", list_item.storage_key),
                        valid_from=str(meta.get("validFrom", list_item.created_at)),
                        valid_to=meta.get("validTo"),
                        version=int(meta.get("version", 1)),
                    ))

        return Graph(entities, relationships)

    async def query(
        self,
        start_entity: str,
        subject: Optional[Dict[str, Any]] = None,
        depth: int = 2,
        valid_at: Optional[str] = None,
    ) -> Graph:
        """
        Load a subgraph around a starting entity.

        Args:
            start_entity: Raw entity name (SDK derives HMAC key)
            subject: Subject context
            depth: How many hops from start (default 2)
            valid_at: ISO8601 point-in-time query

        Returns:
            Subgraph around the entity
        """
        graph = await self.load(subject=subject, valid_at=valid_at)
        entity_key = await self.derive_entity_key(start_entity)
        return graph.subgraph(entity_key, depth)

    # ============================================================
    # Manual Mutations
    # ============================================================

    async def add_entity(
        self,
        name: str,
        entity_type: str,
        subject: Optional[Dict[str, Any]] = None,
        summary: str = "",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Entity:
        """
        Add a single entity to the knowledge graph.

        Args:
            name: Entity display name
            entity_type: Entity type (person, organization, etc.)
            subject: Subject context for scoping
            summary: Brief description
            attributes: Arbitrary attributes

        Returns:
            Created Entity
        """
        enc_key = await self._get_enc_key()
        entity_key = _derive_entity_key(enc_key, name)
        now = datetime.now(timezone.utc).isoformat()
        attrs = attributes or {}

        # Encrypt payload
        encrypted = self.client.memory._encrypt_data(
            {"name": name, "summary": summary, "attributes": attrs},
            enc_key,
        )

        # Build store request
        store_body: Dict[str, Any] = {
            "encryptedData": encrypted,
            "storageTier": "hot",
            "context": GRAPH_ENTITY,
            "tags": [f"et:{entity_type}", f"ek:{entity_key}"],
            "metadata": {
                "entityType": entity_type,
                "entityKey": entity_key,
                "validFrom": now,
                "validTo": None,
                "version": 1,
            },
        }

        if subject:
            if subject.get("subject_id"):
                store_body["subjectId"] = subject["subject_id"]
            if subject.get("scope"):
                store_body["scope"] = subject["scope"]
            if subject.get("segment_id"):
                store_body["segmentId"] = subject["segment_id"]
            if subject.get("tenant_id"):
                store_body["tenantId"] = subject["tenant_id"]

        response = await self.client.request_with_payment(
            "POST", "/v1/memory/store", store_body,
        )

        storage_key = ""
        if response.success and response.data:
            storage_key = response.data.get("storageKey", "")

        return Entity(
            key=entity_key,
            name=name,
            type=entity_type,
            summary=summary,
            attributes=attrs,
            storage_key=storage_key,
            valid_from=now,
            valid_to=None,
            version=1,
        )

    async def add_relationship(
        self,
        from_name: str,
        to_name: str,
        rel_type: str,
        subject: Optional[Dict[str, Any]] = None,
        description: str = "",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Relationship:
        """
        Add a relationship between two entities.

        Args:
            from_name: Source entity name (SDK derives HMAC key)
            to_name: Target entity name (SDK derives HMAC key)
            rel_type: Relationship type
            subject: Subject context
            description: Human-readable description
            attributes: Arbitrary attributes

        Returns:
            Created Relationship
        """
        enc_key = await self._get_enc_key()
        from_key = _derive_entity_key(enc_key, from_name)
        to_key = _derive_entity_key(enc_key, to_name)
        now = datetime.now(timezone.utc).isoformat()
        attrs = attributes or {}

        encrypted = self.client.memory._encrypt_data(
            {"description": description, "attributes": attrs},
            enc_key,
        )

        store_body: Dict[str, Any] = {
            "encryptedData": encrypted,
            "storageTier": "hot",
            "context": GRAPH_RELATIONSHIP,
            "tags": [f"rt:{rel_type}", f"from:{from_key}", f"to:{to_key}"],
            "metadata": {
                "relationType": rel_type,
                "fromEntityKey": from_key,
                "toEntityKey": to_key,
                "validFrom": now,
                "validTo": None,
                "version": 1,
            },
        }

        if subject:
            if subject.get("subject_id"):
                store_body["subjectId"] = subject["subject_id"]
            if subject.get("scope"):
                store_body["scope"] = subject["scope"]

        response = await self.client.request_with_payment(
            "POST", "/v1/memory/store", store_body,
        )

        storage_key = ""
        if response.success and response.data:
            storage_key = response.data.get("storageKey", "")

        return Relationship(
            from_key=from_key,
            to_key=to_key,
            type=rel_type,
            description=description,
            attributes=attrs,
            storage_key=storage_key,
            valid_from=now,
            valid_to=None,
            version=1,
        )

    async def merge_entities(
        self,
        source_name: str,
        target_name: str,
        subject: Optional[Dict[str, Any]] = None,
    ) -> Entity:
        """
        Merge two entities. Source is superseded; target absorbs source attributes.

        Args:
            source_name: Entity to merge FROM (will be superseded)
            target_name: Entity to merge INTO (will be updated)
            subject: Subject context

        Returns:
            Merged target Entity
        """
        graph = await self.load(subject=subject)
        enc_key = await self._get_enc_key()
        source_key = _derive_entity_key(enc_key, source_name)
        target_key = _derive_entity_key(enc_key, target_name)

        source = graph.get_entity(source_key)
        target = graph.get_entity(target_key)

        if not source:
            raise ValueError(f'Source entity "{source_name}" not found')
        if not target:
            raise ValueError(f'Target entity "{target_name}" not found')

        # Merge attributes (target wins, source fills gaps)
        merged_attrs = {**source.attributes, **target.attributes}
        merged_summary = target.summary or source.summary
        now = datetime.now(timezone.utc).isoformat()

        # Store updated target
        updated = await self.add_entity(
            name=target.name,
            entity_type=target.type,
            subject=subject,
            summary=merged_summary,
            attributes=merged_attrs,
        )

        # Supersede source entity by storing a new version with validTo set
        source_encrypted = self.client.memory._encrypt_data(
            {"name": source.name, "summary": source.summary, "attributes": source.attributes},
            enc_key,
        )
        supersede_body: Dict[str, Any] = {
            "encryptedData": source_encrypted,
            "storageTier": "hot",
            "context": GRAPH_ENTITY,
            "tags": [f"et:{source.type}", f"ek:{source_key}"],
            "metadata": {
                "entityType": source.type,
                "entityKey": source_key,
                "validFrom": source.valid_from,
                "validTo": now,
                "version": source.version + 1,
                "supersededBy": updated.storage_key,
            },
        }
        if subject:
            if subject.get("subject_id"):
                supersede_body["subjectId"] = subject["subject_id"]
            if subject.get("scope"):
                supersede_body["scope"] = subject["scope"]

        await self.client.request_with_payment(
            "POST", "/v1/memory/store", supersede_body,
        )

        return Entity(
            key=target_key,
            name=target.name,
            type=target.type,
            summary=merged_summary,
            attributes=merged_attrs,
            storage_key=updated.storage_key,
            valid_from=now,
            valid_to=None,
            version=target.version + 1,
        )

    # ============================================================
    # Ask (LLM-powered Graph Q&A)
    # ============================================================

    async def ask(
        self,
        question: str,
        subject: Optional[Dict[str, Any]] = None,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> GraphAnswer:
        """
        Ask a natural language question against the knowledge graph.

        Loads the graph, builds a text context from entities and relationships,
        then passes it to the extraction service as a graph-ask trace.

        Args:
            question: Natural language question
            subject: Subject context for scoping
            llm_config: LLM configuration dict

        Returns:
            GraphAnswer with answer, sources, and confidence
        """
        graph = await self.load(subject=subject)

        if graph.entity_count == 0:
            return GraphAnswer(
                answer="No knowledge graph data found for this subject.",
                sources=[],
                confidence=0,
            )

        # Build context from graph data
        entity_lines = [
            f"- {e.name} ({e.type}): {e.summary}" for e in graph.entities
        ]
        rel_lines = []
        for r in graph.relationships:
            from_entity = graph.get_entity(r.from_key)
            to_entity = graph.get_entity(r.to_key)
            from_name = from_entity.name if from_entity else r.from_key
            to_name = to_entity.name if to_entity else r.to_key
            rel_lines.append(f"- {from_name} --[{r.type}]--> {to_name}: {r.description}")

        graph_context = "\n".join([
            "ENTITIES:", *entity_lines, "", "RELATIONSHIPS:", *rel_lines,
        ])

        trace = json.dumps({
            "_graphAsk": True,
            "question": question,
            "graphContext": graph_context,
        })

        config = llm_config or {}
        response = await self.client.extraction.extract(
            trace=trace,
            llm_config=config,
            options=type("Opts", (), {
                "confidence_threshold": None,
                "context_hint": "graph-ask",
                "auto_store": False,
                "subject": None,
            })(),
        )

        if response.extractions:
            ext = response.extractions[0]
            answer_text = str(
                (ext.data or {}).get("answer")
                or ext.reasoning
                or "Unable to answer."
            )
            sources = [
                {"key": e.key, "name": e.name, "type": e.type}
                for e in graph.entities
                if e.name.lower() in answer_text.lower()
            ]
            return GraphAnswer(
                answer=answer_text,
                sources=sources,
                confidence=ext.confidence or 0.5,
            )

        return GraphAnswer(
            answer="Unable to answer based on the available knowledge graph.",
            sources=[],
            confidence=0,
        )

    # ============================================================
    # Temporal Methods
    # ============================================================

    async def get_entity_at(
        self,
        name: str,
        at: str,
        subject: Optional[Dict[str, Any]] = None,
    ) -> Optional[Entity]:
        """
        Get the version of an entity valid at a specific point in time.

        Args:
            name: Entity name (SDK derives HMAC key)
            at: ISO8601 timestamp
            subject: Subject context

        Returns:
            Entity valid at that time, or None
        """
        history = await self.get_entity_history(name, subject=subject)
        at_date = datetime.fromisoformat(at.replace("Z", "+00:00"))

        for entity in history:
            from_dt = datetime.fromisoformat(entity.valid_from.replace("Z", "+00:00"))
            to_dt = (
                datetime.fromisoformat(entity.valid_to.replace("Z", "+00:00"))
                if entity.valid_to
                else datetime.max.replace(tzinfo=timezone.utc)
            )
            if from_dt <= at_date <= to_dt:
                return entity

        return None

    async def get_entity_history(
        self,
        name: str,
        subject: Optional[Dict[str, Any]] = None,
    ) -> List[Entity]:
        """
        Get the full version history of an entity.

        Args:
            name: Entity name
            subject: Subject context

        Returns:
            List of Entity versions, oldest first
        """
        entity_key = await self.derive_entity_key(name)
        graph = await self.load(subject=subject)

        # Filter to matching entity key
        versions = [e for e in graph.entities if e.key == entity_key]
        versions.sort(key=lambda e: e.version)
        return versions

    # ============================================================
    # Extraction
    # ============================================================

    async def extract(
        self,
        trace: Union[str, Dict[str, Any]],
        llm_config: Dict[str, Any],
        subject: Optional[Dict[str, Any]] = None,
        context_hint: Optional[str] = None,
        confidence_threshold: float = 0.5,
    ) -> GraphExtractionResult:
        """
        Extract entities and relationships from an agent trace.

        Args:
            trace: Agent execution trace
            llm_config: LLM configuration dict
            subject: Subject context
            context_hint: Domain hint for extraction
            confidence_threshold: Minimum confidence (0-1)

        Returns:
            GraphExtractionResult with stored entities and relationships
        """
        # Load existing entities for resolution
        graph = await self.load(subject=subject)
        known_entities = [
            {"key": e.key, "type": e.type, "name": e.name, "summary": e.summary}
            for e in graph.entities
        ]

        # Call extraction endpoint with graph context in trace
        graph_trace = {
            "_graphExtraction": True,
            "trace": trace if isinstance(trace, str) else json.dumps(trace),
            "knownEntities": known_entities,
        }

        response = await self.client.request_with_payment(
            "POST",
            "/v1/extract",
            {
                "trace": graph_trace,
                "llmConfig": llm_config,
                "options": {
                    "confidenceThreshold": confidence_threshold,
                    "contextHint": f"graph-extraction:{context_hint}" if context_hint else "graph-extraction",
                    "autoStore": False,
                },
            },
        )

        result = GraphExtractionResult()

        if not response.success or not response.data:
            return result

        extractions = response.data.get("extractions", [])
        enc_key = await self._get_enc_key()

        # Process entities from extractions
        for ext in extractions:
            data = ext.get("data", {})
            name = data.get("name")
            if not name:
                continue

            entity_key = _derive_entity_key(enc_key, name)
            entity_type = data.get("entityType", data.get("type", "concept"))
            is_existing = graph.has_entity(entity_key)

            result.entities.append({
                "key": entity_key,
                "type": entity_type,
                "name": name,
                "isNew": not is_existing,
                "updated": is_existing,
            })

        result.stored = len(result.entities) + len(result.relationships)
        return result
