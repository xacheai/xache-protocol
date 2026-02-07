/**
 * GraphEngine — Client-side in-memory knowledge graph
 *
 * Pure data structure with adjacency lists and traversal algorithms.
 * No async, no network calls, no encryption — operates on decrypted data only.
 * Built by GraphService after retrieving + decrypting entities and relationships.
 */

import type { Entity, Relationship, EntityType, RelationshipType } from './types';

/**
 * In-memory graph with adjacency list traversal.
 *
 * @example
 * ```typescript
 * const graph = await client.graph.load({ subject });
 *
 * // Get neighbors
 * const colleagues = graph.neighbors('Alice Chen', { type: 'works_at' });
 *
 * // Find shortest path
 * const path = graph.path('Alice Chen', 'Acme Corp');
 *
 * // Get subgraph within 2 hops
 * const local = graph.subgraph('Alice Chen', 2);
 * ```
 */
export class Graph {
  private readonly entityMap: Map<string, Entity>;
  private readonly nameIndex: Map<string, string>;
  private readonly adjacency: Map<string, Relationship[]>;
  private readonly reverseAdj: Map<string, Relationship[]>;
  private readonly allRelationships: Relationship[];

  constructor(entities: Entity[], relationships: Relationship[]) {
    this.entityMap = new Map();
    this.nameIndex = new Map();
    this.adjacency = new Map();
    this.reverseAdj = new Map();
    this.allRelationships = relationships;

    // Build entity maps
    for (const entity of entities) {
      this.entityMap.set(entity.key, entity);
      this.nameIndex.set(entity.name.toLowerCase(), entity.key);
      this.adjacency.set(entity.key, []);
      this.reverseAdj.set(entity.key, []);
    }

    // Build adjacency lists
    for (const rel of relationships) {
      const outgoing = this.adjacency.get(rel.fromKey);
      if (outgoing) {
        outgoing.push(rel);
      }
      const incoming = this.reverseAdj.get(rel.toKey);
      if (incoming) {
        incoming.push(rel);
      }
    }
  }

  /** All entities in the graph */
  get entities(): Entity[] {
    return Array.from(this.entityMap.values());
  }

  /** All relationships in the graph */
  get relationships(): Relationship[] {
    return this.allRelationships;
  }

  /** Number of entities */
  get entityCount(): number {
    return this.entityMap.size;
  }

  /** Number of relationships */
  get relationshipCount(): number {
    return this.allRelationships.length;
  }

  /**
   * Resolve a name or HMAC key to an entity key.
   * Tries exact key match first, then case-insensitive name lookup.
   */
  private resolveKey(nameOrKey: string): string | null {
    if (this.entityMap.has(nameOrKey)) {
      return nameOrKey;
    }
    return this.nameIndex.get(nameOrKey.toLowerCase()) ?? null;
  }

  /**
   * Get an entity by name or HMAC key.
   * Returns null if not found.
   */
  getEntity(nameOrKey: string): Entity | null {
    const key = this.resolveKey(nameOrKey);
    if (!key) return null;
    return this.entityMap.get(key) ?? null;
  }

  /**
   * Check if an entity exists in the graph.
   */
  hasEntity(nameOrKey: string): boolean {
    return this.resolveKey(nameOrKey) !== null;
  }

  /**
   * Get all entities connected to the given entity (outgoing + incoming edges).
   * Optionally filter by relationship type.
   */
  neighbors(
    nameOrKey: string,
    opts?: { type?: RelationshipType; direction?: 'outgoing' | 'incoming' | 'both' },
  ): Entity[] {
    const key = this.resolveKey(nameOrKey);
    if (!key) return [];

    const direction = opts?.direction ?? 'both';
    const seen = new Set<string>();
    const result: Entity[] = [];

    const addNeighbor = (entityKey: string) => {
      if (entityKey === key || seen.has(entityKey)) return;
      seen.add(entityKey);
      const entity = this.entityMap.get(entityKey);
      if (entity) result.push(entity);
    };

    // Outgoing edges (this entity -> neighbor)
    if (direction === 'both' || direction === 'outgoing') {
      const outgoing = this.adjacency.get(key) ?? [];
      for (const rel of outgoing) {
        if (!opts?.type || rel.type === opts.type) {
          addNeighbor(rel.toKey);
        }
      }
    }

    // Incoming edges (neighbor -> this entity)
    if (direction === 'both' || direction === 'incoming') {
      const incoming = this.reverseAdj.get(key) ?? [];
      for (const rel of incoming) {
        if (!opts?.type || rel.type === opts.type) {
          addNeighbor(rel.fromKey);
        }
      }
    }

    return result;
  }

  /**
   * Get all relationships connected to an entity.
   * Optionally filter by type and/or direction.
   */
  edgesOf(
    nameOrKey: string,
    opts?: { type?: RelationshipType; direction?: 'outgoing' | 'incoming' | 'both' },
  ): Relationship[] {
    const key = this.resolveKey(nameOrKey);
    if (!key) return [];

    const direction = opts?.direction ?? 'both';
    const result: Relationship[] = [];

    if (direction === 'both' || direction === 'outgoing') {
      const outgoing = this.adjacency.get(key) ?? [];
      for (const rel of outgoing) {
        if (!opts?.type || rel.type === opts.type) {
          result.push(rel);
        }
      }
    }

    if (direction === 'both' || direction === 'incoming') {
      const incoming = this.reverseAdj.get(key) ?? [];
      for (const rel of incoming) {
        if (!opts?.type || rel.type === opts.type) {
          result.push(rel);
        }
      }
    }

    return result;
  }

  /**
   * Find the shortest path between two entities using BFS.
   * Returns the relationship chain connecting them, or empty array if no path exists.
   */
  path(fromNameOrKey: string, toNameOrKey: string): Relationship[] {
    const fromKey = this.resolveKey(fromNameOrKey);
    const toKey = this.resolveKey(toNameOrKey);
    if (!fromKey || !toKey) return [];
    if (fromKey === toKey) return [];

    // BFS with parent tracking
    const visited = new Set<string>([fromKey]);
    const parentEdge = new Map<string, { parentKey: string; rel: Relationship }>();
    const queue: string[] = [fromKey];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Check outgoing edges
      const outgoing = this.adjacency.get(current) ?? [];
      for (const rel of outgoing) {
        if (!visited.has(rel.toKey)) {
          visited.add(rel.toKey);
          parentEdge.set(rel.toKey, { parentKey: current, rel });
          if (rel.toKey === toKey) {
            return this.reconstructPath(parentEdge, fromKey, toKey);
          }
          queue.push(rel.toKey);
        }
      }

      // Check incoming edges (bidirectional traversal)
      const incoming = this.reverseAdj.get(current) ?? [];
      for (const rel of incoming) {
        if (!visited.has(rel.fromKey)) {
          visited.add(rel.fromKey);
          parentEdge.set(rel.fromKey, { parentKey: current, rel });
          if (rel.fromKey === toKey) {
            return this.reconstructPath(parentEdge, fromKey, toKey);
          }
          queue.push(rel.fromKey);
        }
      }
    }

    return []; // No path found
  }

  /**
   * Reconstruct the path from BFS parent tracking.
   */
  private reconstructPath(
    parentEdge: Map<string, { parentKey: string; rel: Relationship }>,
    fromKey: string,
    toKey: string,
  ): Relationship[] {
    const path: Relationship[] = [];
    let current = toKey;

    while (current !== fromKey) {
      const edge = parentEdge.get(current);
      if (!edge) return []; // Should not happen if BFS found the path
      path.unshift(edge.rel);
      current = edge.parentKey;
    }

    return path;
  }

  /**
   * Extract a subgraph around a center entity within a given hop depth.
   * Uses BFS from the center, collecting entities and relationships.
   */
  subgraph(centerNameOrKey: string, depth: number): Graph {
    const centerKey = this.resolveKey(centerNameOrKey);
    if (!centerKey) return new Graph([], []);

    const entityKeys = new Set<string>([centerKey]);
    const queue: Array<{ key: string; currentDepth: number }> = [
      { key: centerKey, currentDepth: 0 },
    ];

    // BFS to collect entity keys within depth
    while (queue.length > 0) {
      const { key, currentDepth } = queue.shift()!;
      if (currentDepth >= depth) continue;

      // Outgoing
      const outgoing = this.adjacency.get(key) ?? [];
      for (const rel of outgoing) {
        if (!entityKeys.has(rel.toKey)) {
          entityKeys.add(rel.toKey);
          queue.push({ key: rel.toKey, currentDepth: currentDepth + 1 });
        }
      }

      // Incoming
      const incoming = this.reverseAdj.get(key) ?? [];
      for (const rel of incoming) {
        if (!entityKeys.has(rel.fromKey)) {
          entityKeys.add(rel.fromKey);
          queue.push({ key: rel.fromKey, currentDepth: currentDepth + 1 });
        }
      }
    }

    // Collect entities
    const entities: Entity[] = [];
    for (const key of entityKeys) {
      const entity = this.entityMap.get(key);
      if (entity) entities.push(entity);
    }

    // Collect relationships where both endpoints are in the subgraph
    const relationships = this.allRelationships.filter(
      (r) => entityKeys.has(r.fromKey) && entityKeys.has(r.toKey),
    );

    return new Graph(entities, relationships);
  }

  /**
   * Get all entities of a given type.
   */
  entitiesOfType(type: EntityType): Entity[] {
    return this.entities.filter((e) => e.type === type);
  }

  /**
   * Get all relationships of a given type.
   */
  relationshipsOfType(type: RelationshipType): Relationship[] {
    return this.allRelationships.filter((r) => r.type === type);
  }

  /**
   * Search entities by name substring (case-insensitive).
   */
  searchEntities(query: string): Entity[] {
    const lower = query.toLowerCase();
    return this.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.summary.toLowerCase().includes(lower),
    );
  }

  /**
   * Serialize the graph to a plain JSON object.
   */
  toJSON(): { entities: Entity[]; relationships: Relationship[] } {
    return {
      entities: this.entities,
      relationships: this.allRelationships,
    };
  }
}
