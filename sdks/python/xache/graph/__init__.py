"""
Knowledge Graph module for Xache Python SDK

Privacy-preserving knowledge graph built on encrypted memory primitives.
Entities and relationships are stored as encrypted memories.
Graph construction and traversal happen client-side after decryption.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


# ============================================================
# Types
# ============================================================

@dataclass
class Entity:
    """A decrypted entity in the knowledge graph."""
    key: str                              # HMAC-derived entity key (64 hex)
    name: str                             # Decrypted display name
    type: str                             # Entity type (person, organization, etc.)
    summary: str                          # Decrypted brief description
    attributes: Dict[str, Any]            # Decrypted arbitrary attributes
    storage_key: str                      # Server storage key
    valid_from: str                       # ISO8601 when this version became valid
    valid_to: Optional[str] = None        # ISO8601 when superseded, None if current
    version: int = 1                      # Version number


@dataclass
class Relationship:
    """A decrypted relationship between two entities."""
    from_key: str                         # HMAC-derived key of source entity
    to_key: str                           # HMAC-derived key of target entity
    type: str                             # Relationship type (works_at, knows, etc.)
    description: str                      # Decrypted description
    attributes: Dict[str, Any]            # Decrypted attributes
    storage_key: str                      # Server storage key
    valid_from: str                       # ISO8601
    valid_to: Optional[str] = None        # ISO8601, None if current
    version: int = 1


@dataclass
class GraphExtractionResult:
    """Result of a graph extraction operation."""
    entities: List[Dict[str, Any]] = field(default_factory=list)
    relationships: List[Dict[str, Any]] = field(default_factory=list)
    temporal_updates: List[Dict[str, Any]] = field(default_factory=list)
    stored: int = 0
    receipts: List[str] = field(default_factory=list)


@dataclass
class GraphAnswer:
    """Answer from a graph.ask() query."""
    answer: str = ""
    sources: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0


# ============================================================
# Graph Engine (in-memory, pure data structure)
# ============================================================

class Graph:
    """
    In-memory graph with adjacency list traversal.

    Pure data structure — no async, no network calls.
    Built by GraphService after retrieving + decrypting entities and relationships.

    Example:
        ```python
        graph = await client.graph.load(subject=subject_ctx)

        # Get neighbors
        colleagues = graph.neighbors("Alice Chen", rel_type="works_at")

        # Find shortest path
        path = graph.path("Alice Chen", "Acme Corp")

        # Get subgraph within 2 hops
        local = graph.subgraph("Alice Chen", depth=2)
        ```
    """

    def __init__(self, entities: List[Entity], relationships: List[Relationship]):
        self._entity_map: Dict[str, Entity] = {}
        self._name_index: Dict[str, str] = {}
        self._adjacency: Dict[str, List[Relationship]] = {}
        self._reverse_adj: Dict[str, List[Relationship]] = {}
        self._all_relationships = relationships

        # Build entity maps
        for entity in entities:
            self._entity_map[entity.key] = entity
            self._name_index[entity.name.lower()] = entity.key
            self._adjacency[entity.key] = []
            self._reverse_adj[entity.key] = []

        # Build adjacency lists
        for rel in relationships:
            if rel.from_key in self._adjacency:
                self._adjacency[rel.from_key].append(rel)
            if rel.to_key in self._reverse_adj:
                self._reverse_adj[rel.to_key].append(rel)

    @property
    def entities(self) -> List[Entity]:
        """All entities in the graph."""
        return list(self._entity_map.values())

    @property
    def relationships(self) -> List[Relationship]:
        """All relationships in the graph."""
        return self._all_relationships

    @property
    def entity_count(self) -> int:
        return len(self._entity_map)

    @property
    def relationship_count(self) -> int:
        return len(self._all_relationships)

    def _resolve_key(self, name_or_key: str) -> Optional[str]:
        """Resolve a name or HMAC key to an entity key."""
        if name_or_key in self._entity_map:
            return name_or_key
        return self._name_index.get(name_or_key.lower())

    def get_entity(self, name_or_key: str) -> Optional[Entity]:
        """Get an entity by name or HMAC key."""
        key = self._resolve_key(name_or_key)
        if key is None:
            return None
        return self._entity_map.get(key)

    def has_entity(self, name_or_key: str) -> bool:
        """Check if an entity exists in the graph."""
        return self._resolve_key(name_or_key) is not None

    def neighbors(
        self,
        name_or_key: str,
        rel_type: Optional[str] = None,
        direction: str = "both",
    ) -> List[Entity]:
        """
        Get all entities connected to the given entity.

        Args:
            name_or_key: Entity name or HMAC key
            rel_type: Filter by relationship type
            direction: "outgoing", "incoming", or "both"
        """
        key = self._resolve_key(name_or_key)
        if key is None:
            return []

        seen = set()
        result = []

        def add_neighbor(entity_key: str) -> None:
            if entity_key == key or entity_key in seen:
                return
            seen.add(entity_key)
            entity = self._entity_map.get(entity_key)
            if entity:
                result.append(entity)

        if direction in ("both", "outgoing"):
            for rel in self._adjacency.get(key, []):
                if rel_type is None or rel.type == rel_type:
                    add_neighbor(rel.to_key)

        if direction in ("both", "incoming"):
            for rel in self._reverse_adj.get(key, []):
                if rel_type is None or rel.type == rel_type:
                    add_neighbor(rel.from_key)

        return result

    def edges_of(
        self,
        name_or_key: str,
        rel_type: Optional[str] = None,
        direction: str = "both",
    ) -> List[Relationship]:
        """Get all relationships connected to an entity."""
        key = self._resolve_key(name_or_key)
        if key is None:
            return []

        result = []

        if direction in ("both", "outgoing"):
            for rel in self._adjacency.get(key, []):
                if rel_type is None or rel.type == rel_type:
                    result.append(rel)

        if direction in ("both", "incoming"):
            for rel in self._reverse_adj.get(key, []):
                if rel_type is None or rel.type == rel_type:
                    result.append(rel)

        return result

    def path(self, from_name_or_key: str, to_name_or_key: str) -> List[Relationship]:
        """
        Find the shortest path between two entities using BFS.
        Returns the relationship chain, or empty list if no path.
        """
        from_key = self._resolve_key(from_name_or_key)
        to_key = self._resolve_key(to_name_or_key)
        if not from_key or not to_key or from_key == to_key:
            return []

        from collections import deque

        visited = {from_key}
        parent_edge: Dict[str, Tuple[str, Relationship]] = {}  # key -> (parent_key, rel)
        queue = deque([from_key])

        while queue:
            current = queue.popleft()

            # Outgoing
            for rel in self._adjacency.get(current, []):
                if rel.to_key not in visited:
                    visited.add(rel.to_key)
                    parent_edge[rel.to_key] = (current, rel)
                    if rel.to_key == to_key:
                        return self._reconstruct_path(parent_edge, from_key, to_key)
                    queue.append(rel.to_key)

            # Incoming (bidirectional)
            for rel in self._reverse_adj.get(current, []):
                if rel.from_key not in visited:
                    visited.add(rel.from_key)
                    parent_edge[rel.from_key] = (current, rel)
                    if rel.from_key == to_key:
                        return self._reconstruct_path(parent_edge, from_key, to_key)
                    queue.append(rel.from_key)

        return []

    def _reconstruct_path(
        self,
        parent_edge: Dict[str, Tuple[str, Relationship]],
        from_key: str,
        to_key: str,
    ) -> List[Relationship]:
        """Reconstruct path from BFS parent tracking."""
        path: List[Relationship] = []
        current = to_key
        while current != from_key:
            parent_key, rel = parent_edge[current]
            path.insert(0, rel)
            current = parent_key
        return path

    def subgraph(self, center_name_or_key: str, depth: int) -> "Graph":
        """
        Extract a subgraph around a center entity within a given hop depth.
        """
        from collections import deque

        center_key = self._resolve_key(center_name_or_key)
        if center_key is None:
            return Graph([], [])

        entity_keys = {center_key}
        queue = deque([(center_key, 0)])

        while queue:
            key, current_depth = queue.popleft()
            if current_depth >= depth:
                continue

            for rel in self._adjacency.get(key, []):
                if rel.to_key not in entity_keys:
                    entity_keys.add(rel.to_key)
                    queue.append((rel.to_key, current_depth + 1))

            for rel in self._reverse_adj.get(key, []):
                if rel.from_key not in entity_keys:
                    entity_keys.add(rel.from_key)
                    queue.append((rel.from_key, current_depth + 1))

        entities = [self._entity_map[k] for k in entity_keys if k in self._entity_map]
        relationships = [
            r for r in self._all_relationships
            if r.from_key in entity_keys and r.to_key in entity_keys
        ]

        return Graph(entities, relationships)

    def entities_of_type(self, entity_type: str) -> List[Entity]:
        """Get all entities of a given type."""
        return [e for e in self.entities if e.type == entity_type]

    def relationships_of_type(self, rel_type: str) -> List[Relationship]:
        """Get all relationships of a given type."""
        return [r for r in self._all_relationships if r.type == rel_type]

    def search_entities(self, query: str) -> List[Entity]:
        """Search entities by name or summary substring (case-insensitive)."""
        lower = query.lower()
        return [
            e for e in self.entities
            if lower in e.name.lower() or lower in e.summary.lower()
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the graph to a plain dict."""
        from dataclasses import asdict
        return {
            "entities": [asdict(e) for e in self.entities],
            "relationships": [asdict(r) for r in self._all_relationships],
        }
