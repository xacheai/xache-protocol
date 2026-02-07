"""
GraphEngine unit tests — Python SDK

Mirrors TypeScript sdk/typescript/src/graph/GraphEngine.test.ts.
Tests the in-memory graph data structure in isolation.
No network calls, no encryption — pure data structure tests.
"""

import pytest

from xache.graph import Entity, Relationship, Graph


# ============================================================
# Test Data
# ============================================================

def make_entity(**overrides) -> Entity:
    key = overrides.pop("key")
    name = overrides.pop("name")
    defaults = {
        "key": key,
        "name": name,
        "type": "person",
        "summary": "",
        "attributes": {},
        "storage_key": f"mem_{key}",
        "valid_from": "2026-01-01T00:00:00Z",
        "valid_to": None,
        "version": 1,
    }
    defaults.update(overrides)
    return Entity(**defaults)


def make_rel(**overrides) -> Relationship:
    from_key = overrides.pop("from_key")
    to_key = overrides.pop("to_key")
    defaults = {
        "from_key": from_key,
        "to_key": to_key,
        "type": "related_to",
        "description": "",
        "attributes": {},
        "storage_key": f"mem_rel_{from_key}_{to_key}",
        "valid_from": "2026-01-01T00:00:00Z",
        "valid_to": None,
        "version": 1,
    }
    defaults.update(overrides)
    return Relationship(**defaults)


# Entities
alice = make_entity(key="k_alice", name="Alice Chen", type="person", summary="CTO of Acme")
bob = make_entity(key="k_bob", name="Bob Smith", type="person", summary="Engineer at Acme")
acme = make_entity(key="k_acme", name="Acme Corp", type="organization", summary="Tech company")
slack = make_entity(key="k_slack", name="Slack", type="tool", summary="Chat tool")
sf = make_entity(key="k_sf", name="San Francisco", type="location", summary="City in California")

# Relationships
alice_works_at = make_rel(from_key="k_alice", to_key="k_acme", type="works_at", description="Alice is CTO at Acme")
bob_works_at = make_rel(from_key="k_bob", to_key="k_acme", type="works_at", description="Bob works at Acme")
alice_knows_bob = make_rel(from_key="k_alice", to_key="k_bob", type="knows", description="Alice knows Bob")
acme_uses_slack = make_rel(from_key="k_acme", to_key="k_slack", type="uses", description="Acme uses Slack")
acme_located_in = make_rel(from_key="k_acme", to_key="k_sf", type="located_in", description="Acme is in SF")


# ============================================================
# Tests
# ============================================================

class TestConstruction:
    def test_empty_graph(self):
        graph = Graph([], [])
        assert graph.entity_count == 0
        assert graph.relationship_count == 0
        assert graph.entities == []
        assert graph.relationships == []

    def test_graph_with_entities_and_relationships(self):
        graph = Graph(
            [alice, bob, acme, slack, sf],
            [alice_works_at, bob_works_at, alice_knows_bob, acme_uses_slack, acme_located_in],
        )
        assert graph.entity_count == 5
        assert graph.relationship_count == 5


class TestGetEntity:
    graph = Graph([alice, bob, acme], [alice_works_at])

    def test_find_by_hmac_key(self):
        entity = self.graph.get_entity("k_alice")
        assert entity is not None
        assert entity.name == "Alice Chen"

    def test_find_by_name_case_insensitive(self):
        entity = self.graph.get_entity("alice chen")
        assert entity is not None
        assert entity.key == "k_alice"

    def test_find_by_exact_name(self):
        entity = self.graph.get_entity("Alice Chen")
        assert entity is not None

    def test_returns_none_for_unknown(self):
        assert self.graph.get_entity("unknown") is None


class TestHasEntity:
    graph = Graph([alice], [])

    def test_true_for_existing_entity(self):
        assert self.graph.has_entity("k_alice") is True
        assert self.graph.has_entity("Alice Chen") is True

    def test_false_for_missing_entity(self):
        assert self.graph.has_entity("nonexistent") is False


class TestNeighbors:
    graph = Graph(
        [alice, bob, acme, slack, sf],
        [alice_works_at, bob_works_at, alice_knows_bob, acme_uses_slack, acme_located_in],
    )

    def test_all_neighbors_both_directions(self):
        neighbors = self.graph.neighbors("Alice Chen")
        names = sorted(e.name for e in neighbors)
        assert names == ["Acme Corp", "Bob Smith"]

    def test_filter_by_relationship_type(self):
        neighbors = self.graph.neighbors("Alice Chen", rel_type="works_at")
        assert len(neighbors) == 1
        assert neighbors[0].name == "Acme Corp"

    def test_outgoing_only(self):
        neighbors = self.graph.neighbors("Alice Chen", direction="outgoing")
        names = sorted(e.name for e in neighbors)
        assert names == ["Acme Corp", "Bob Smith"]

    def test_incoming_only(self):
        neighbors = self.graph.neighbors("Acme Corp", direction="incoming")
        names = sorted(e.name for e in neighbors)
        assert names == ["Alice Chen", "Bob Smith"]

    def test_empty_for_isolated_entity(self):
        isolated = make_entity(key="k_iso", name="Isolated")
        g = Graph([isolated], [])
        assert g.neighbors("Isolated") == []

    def test_empty_for_unknown_entity(self):
        assert self.graph.neighbors("nonexistent") == []


class TestEdgesOf:
    graph = Graph(
        [alice, bob, acme],
        [alice_works_at, alice_knows_bob],
    )

    def test_all_edges_for_entity(self):
        edges = self.graph.edges_of("Alice Chen")
        assert len(edges) == 2

    def test_filter_by_type(self):
        edges = self.graph.edges_of("Alice Chen", rel_type="works_at")
        assert len(edges) == 1
        assert edges[0].to_key == "k_acme"


class TestPath:
    graph = Graph(
        [alice, bob, acme, slack, sf],
        [alice_works_at, bob_works_at, alice_knows_bob, acme_uses_slack, acme_located_in],
    )

    def test_direct_path(self):
        p = self.graph.path("Alice Chen", "Acme Corp")
        assert len(p) == 1
        assert p[0].type == "works_at"

    def test_multi_hop_path(self):
        p = self.graph.path("Alice Chen", "Slack")
        assert len(p) == 2  # Alice -> Acme -> Slack

    def test_path_through_reverse_edges(self):
        # Bob -> Acme (outgoing), Acme -> Alice (reverse of Alice -> Acme)
        p = self.graph.path("Bob Smith", "Alice Chen")
        assert len(p) > 0

    def test_empty_for_same_entity(self):
        assert self.graph.path("Alice Chen", "Alice Chen") == []

    def test_empty_for_disconnected(self):
        isolated = make_entity(key="k_iso", name="Isolated")
        g = Graph([alice, isolated], [])
        assert g.path("Alice Chen", "Isolated") == []

    def test_empty_for_unknown_entities(self):
        assert self.graph.path("unknown1", "unknown2") == []


class TestSubgraph:
    graph = Graph(
        [alice, bob, acme, slack, sf],
        [alice_works_at, bob_works_at, alice_knows_bob, acme_uses_slack, acme_located_in],
    )

    def test_depth_0_center_only(self):
        sub = self.graph.subgraph("Alice Chen", 0)
        assert sub.entity_count == 1
        assert sub.entities[0].name == "Alice Chen"
        assert sub.relationship_count == 0

    def test_depth_1_neighborhood(self):
        sub = self.graph.subgraph("Alice Chen", 1)
        assert sub.entity_count == 3  # Alice, Bob, Acme
        assert sub.relationship_count == 3  # works_at, knows, bob_works_at

    def test_depth_2_full_graph(self):
        sub = self.graph.subgraph("Alice Chen", 2)
        assert sub.entity_count == 5  # All entities
        assert sub.relationship_count == 5  # All relationships

    def test_unknown_center(self):
        sub = self.graph.subgraph("nonexistent", 2)
        assert sub.entity_count == 0


class TestEntitiesOfType:
    graph = Graph([alice, bob, acme, slack, sf], [])

    def test_filter_by_type(self):
        assert len(self.graph.entities_of_type("person")) == 2
        assert len(self.graph.entities_of_type("organization")) == 1
        assert len(self.graph.entities_of_type("tool")) == 1
        assert len(self.graph.entities_of_type("location")) == 1

    def test_empty_for_unknown_type(self):
        assert len(self.graph.entities_of_type("event")) == 0


class TestRelationshipsOfType:
    graph = Graph(
        [alice, bob, acme, slack],
        [alice_works_at, bob_works_at, alice_knows_bob, acme_uses_slack],
    )

    def test_filter_by_type(self):
        assert len(self.graph.relationships_of_type("works_at")) == 2
        assert len(self.graph.relationships_of_type("knows")) == 1
        assert len(self.graph.relationships_of_type("uses")) == 1


class TestSearchEntities:
    graph = Graph([alice, bob, acme, slack, sf], [])

    def test_search_by_name(self):
        results = self.graph.search_entities("alice")
        assert len(results) == 1
        assert results[0].name == "Alice Chen"

    def test_search_by_summary(self):
        results = self.graph.search_entities("CTO")
        assert len(results) == 1
        assert results[0].name == "Alice Chen"

    def test_case_insensitive(self):
        results = self.graph.search_entities("ACME")
        assert len(results) >= 1
        assert any(e.name == "Acme Corp" for e in results)

    def test_empty_for_no_matches(self):
        assert len(self.graph.search_entities("zzz")) == 0


class TestToDict:
    def test_serialize(self):
        graph = Graph([alice, bob], [alice_knows_bob])
        d = graph.to_dict()
        assert len(d["entities"]) == 2
        assert len(d["relationships"]) == 1
