/**
 * GraphEngine unit tests
 *
 * Tests the in-memory graph data structure in isolation.
 * No network calls, no encryption — pure data structure tests.
 */

import { describe, it, expect } from 'vitest';
import { Graph } from './GraphEngine';
import type { Entity, Relationship } from './types';

// ============================================================
// Test Data
// ============================================================

function makeEntity(overrides: Partial<Entity> & { key: string; name: string }): Entity {
  return {
    type: 'person',
    summary: '',
    attributes: {},
    storageKey: `mem_${overrides.key}`,
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    version: 1,
    ...overrides,
  };
}

function makeRel(overrides: Partial<Relationship> & { fromKey: string; toKey: string }): Relationship {
  return {
    type: 'related_to',
    description: '',
    attributes: {},
    storageKey: `mem_rel_${overrides.fromKey}_${overrides.toKey}`,
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    version: 1,
    ...overrides,
  };
}

// Entities
const alice = makeEntity({ key: 'k_alice', name: 'Alice Chen', type: 'person', summary: 'CTO of Acme' });
const bob = makeEntity({ key: 'k_bob', name: 'Bob Smith', type: 'person', summary: 'Engineer at Acme' });
const acme = makeEntity({ key: 'k_acme', name: 'Acme Corp', type: 'organization', summary: 'Tech company' });
const slack = makeEntity({ key: 'k_slack', name: 'Slack', type: 'tool', summary: 'Chat tool' });
const sf = makeEntity({ key: 'k_sf', name: 'San Francisco', type: 'location', summary: 'City in California' });

// Relationships
const aliceWorksAt = makeRel({ fromKey: 'k_alice', toKey: 'k_acme', type: 'works_at', description: 'Alice is CTO at Acme' });
const bobWorksAt = makeRel({ fromKey: 'k_bob', toKey: 'k_acme', type: 'works_at', description: 'Bob works at Acme' });
const aliceKnowsBob = makeRel({ fromKey: 'k_alice', toKey: 'k_bob', type: 'knows', description: 'Alice knows Bob' });
const acmeUsesSlack = makeRel({ fromKey: 'k_acme', toKey: 'k_slack', type: 'uses', description: 'Acme uses Slack' });
const acmeLocatedIn = makeRel({ fromKey: 'k_acme', toKey: 'k_sf', type: 'located_in', description: 'Acme is in SF' });

// ============================================================
// Tests
// ============================================================

describe('Graph', () => {
  describe('construction', () => {
    it('should create an empty graph', () => {
      const graph = new Graph([], []);
      expect(graph.entityCount).toBe(0);
      expect(graph.relationshipCount).toBe(0);
      expect(graph.entities).toEqual([]);
      expect(graph.relationships).toEqual([]);
    });

    it('should create a graph with entities and relationships', () => {
      const graph = new Graph(
        [alice, bob, acme, slack, sf],
        [aliceWorksAt, bobWorksAt, aliceKnowsBob, acmeUsesSlack, acmeLocatedIn],
      );

      expect(graph.entityCount).toBe(5);
      expect(graph.relationshipCount).toBe(5);
    });
  });

  describe('getEntity', () => {
    const graph = new Graph([alice, bob, acme], [aliceWorksAt]);

    it('should find entity by HMAC key', () => {
      const entity = graph.getEntity('k_alice');
      expect(entity).not.toBeNull();
      expect(entity!.name).toBe('Alice Chen');
    });

    it('should find entity by name (case-insensitive)', () => {
      const entity = graph.getEntity('alice chen');
      expect(entity).not.toBeNull();
      expect(entity!.key).toBe('k_alice');
    });

    it('should find entity by exact name', () => {
      const entity = graph.getEntity('Alice Chen');
      expect(entity).not.toBeNull();
    });

    it('should return null for unknown entity', () => {
      expect(graph.getEntity('unknown')).toBeNull();
    });
  });

  describe('hasEntity', () => {
    const graph = new Graph([alice], []);

    it('should return true for existing entity', () => {
      expect(graph.hasEntity('k_alice')).toBe(true);
      expect(graph.hasEntity('Alice Chen')).toBe(true);
    });

    it('should return false for missing entity', () => {
      expect(graph.hasEntity('nonexistent')).toBe(false);
    });
  });

  describe('neighbors', () => {
    const graph = new Graph(
      [alice, bob, acme, slack, sf],
      [aliceWorksAt, bobWorksAt, aliceKnowsBob, acmeUsesSlack, acmeLocatedIn],
    );

    it('should return all neighbors (both directions)', () => {
      const neighbors = graph.neighbors('Alice Chen');
      const names = neighbors.map((e) => e.name).sort();
      expect(names).toEqual(['Acme Corp', 'Bob Smith']);
    });

    it('should filter by relationship type', () => {
      const neighbors = graph.neighbors('Alice Chen', { type: 'works_at' });
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].name).toBe('Acme Corp');
    });

    it('should return outgoing-only neighbors', () => {
      const neighbors = graph.neighbors('Alice Chen', { direction: 'outgoing' });
      const names = neighbors.map((e) => e.name).sort();
      expect(names).toEqual(['Acme Corp', 'Bob Smith']);
    });

    it('should return incoming-only neighbors', () => {
      const neighbors = graph.neighbors('Acme Corp', { direction: 'incoming' });
      const names = neighbors.map((e) => e.name).sort();
      expect(names).toEqual(['Alice Chen', 'Bob Smith']);
    });

    it('should return empty for entity with no connections', () => {
      const isolated = makeEntity({ key: 'k_iso', name: 'Isolated' });
      const g = new Graph([isolated], []);
      expect(g.neighbors('Isolated')).toEqual([]);
    });

    it('should return empty for unknown entity', () => {
      expect(graph.neighbors('nonexistent')).toEqual([]);
    });
  });

  describe('edgesOf', () => {
    const graph = new Graph(
      [alice, bob, acme],
      [aliceWorksAt, aliceKnowsBob],
    );

    it('should return all edges for an entity', () => {
      const edges = graph.edgesOf('Alice Chen');
      expect(edges).toHaveLength(2);
    });

    it('should filter by type', () => {
      const edges = graph.edgesOf('Alice Chen', { type: 'works_at' });
      expect(edges).toHaveLength(1);
      expect(edges[0].toKey).toBe('k_acme');
    });
  });

  describe('path', () => {
    const graph = new Graph(
      [alice, bob, acme, slack, sf],
      [aliceWorksAt, bobWorksAt, aliceKnowsBob, acmeUsesSlack, acmeLocatedIn],
    );

    it('should find direct path', () => {
      const p = graph.path('Alice Chen', 'Acme Corp');
      expect(p).toHaveLength(1);
      expect(p[0].type).toBe('works_at');
    });

    it('should find multi-hop path', () => {
      const p = graph.path('Alice Chen', 'Slack');
      expect(p).toHaveLength(2); // Alice -> Acme -> Slack
    });

    it('should find path through reverse edges', () => {
      // Bob -> Acme (outgoing), Acme -> Alice (reverse of Alice -> Acme)
      const p = graph.path('Bob Smith', 'Alice Chen');
      expect(p.length).toBeGreaterThan(0);
    });

    it('should return empty for same entity', () => {
      expect(graph.path('Alice Chen', 'Alice Chen')).toEqual([]);
    });

    it('should return empty for disconnected entities', () => {
      const isolated = makeEntity({ key: 'k_iso', name: 'Isolated' });
      const g = new Graph([alice, isolated], []);
      expect(g.path('Alice Chen', 'Isolated')).toEqual([]);
    });

    it('should return empty for unknown entities', () => {
      expect(graph.path('unknown1', 'unknown2')).toEqual([]);
    });
  });

  describe('subgraph', () => {
    const graph = new Graph(
      [alice, bob, acme, slack, sf],
      [aliceWorksAt, bobWorksAt, aliceKnowsBob, acmeUsesSlack, acmeLocatedIn],
    );

    it('should return center entity at depth 0', () => {
      const sub = graph.subgraph('Alice Chen', 0);
      expect(sub.entityCount).toBe(1);
      expect(sub.entities[0].name).toBe('Alice Chen');
      expect(sub.relationshipCount).toBe(0);
    });

    it('should return 1-hop neighborhood', () => {
      const sub = graph.subgraph('Alice Chen', 1);
      expect(sub.entityCount).toBe(3); // Alice, Bob, Acme
      expect(sub.relationshipCount).toBe(3); // works_at, knows, bob_works_at
    });

    it('should return 2-hop neighborhood', () => {
      const sub = graph.subgraph('Alice Chen', 2);
      expect(sub.entityCount).toBe(5); // All entities
      expect(sub.relationshipCount).toBe(5); // All relationships
    });

    it('should handle unknown center entity', () => {
      const sub = graph.subgraph('nonexistent', 2);
      expect(sub.entityCount).toBe(0);
    });
  });

  describe('entitiesOfType', () => {
    const graph = new Graph([alice, bob, acme, slack, sf], []);

    it('should filter entities by type', () => {
      expect(graph.entitiesOfType('person')).toHaveLength(2);
      expect(graph.entitiesOfType('organization')).toHaveLength(1);
      expect(graph.entitiesOfType('tool')).toHaveLength(1);
      expect(graph.entitiesOfType('location')).toHaveLength(1);
    });

    it('should return empty for unknown type', () => {
      expect(graph.entitiesOfType('event')).toHaveLength(0);
    });
  });

  describe('relationshipsOfType', () => {
    const graph = new Graph(
      [alice, bob, acme, slack],
      [aliceWorksAt, bobWorksAt, aliceKnowsBob, acmeUsesSlack],
    );

    it('should filter relationships by type', () => {
      expect(graph.relationshipsOfType('works_at')).toHaveLength(2);
      expect(graph.relationshipsOfType('knows')).toHaveLength(1);
      expect(graph.relationshipsOfType('uses')).toHaveLength(1);
    });
  });

  describe('searchEntities', () => {
    const graph = new Graph([alice, bob, acme, slack, sf], []);

    it('should search by name', () => {
      const results = graph.searchEntities('alice');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice Chen');
    });

    it('should search by summary', () => {
      const results = graph.searchEntities('CTO');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice Chen');
    });

    it('should be case-insensitive', () => {
      const results = graph.searchEntities('ACME');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((e) => e.name === 'Acme Corp')).toBe(true);
    });

    it('should return empty for no matches', () => {
      expect(graph.searchEntities('zzz')).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const graph = new Graph([alice, bob], [aliceKnowsBob]);
      const json = graph.toJSON();
      expect(json.entities).toHaveLength(2);
      expect(json.relationships).toHaveLength(1);
    });
  });
});
