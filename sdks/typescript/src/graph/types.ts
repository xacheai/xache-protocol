/**
 * Graph Types for Xache TS SDK
 *
 * Client-side types for the privacy-preserving knowledge graph.
 * These represent decrypted data — the server never sees these contents.
 */

import type { SubjectContext, LLMConfig } from '../types';

// ============================================================
// Shared Graph Type Aliases (mirrored from @xache/types)
// ============================================================

/**
 * Standard entity types. Developers can also use custom strings.
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'tool'
  | 'concept'
  | 'location'
  | 'event'
  | 'product'
  | 'project'
  | string;

/**
 * Standard relationship types. Developers can also use custom strings.
 */
export type RelationshipType =
  | 'works_at'
  | 'knows'
  | 'uses'
  | 'manages'
  | 'reports_to'
  | 'part_of'
  | 'created'
  | 'owns'
  | 'located_in'
  | 'related_to'
  | string;

/**
 * Temporal update detected during extraction
 */
export interface GraphExtractionTemporalUpdate {
  entityKey: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  effectiveDate: string;
  evidence?: string;
}

/**
 * Result of a graph extraction operation
 */
export interface GraphExtractionResult {
  entities: Array<{
    key: string;
    type: EntityType;
    name: string;
    isNew: boolean;
    updated: boolean;
    storageKey: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: RelationshipType;
    isNew: boolean;
    storageKey: string;
  }>;
  temporalUpdates: GraphExtractionTemporalUpdate[];
  stored: number;
  receipts: string[];
}

/**
 * Answer from a graph.ask() query
 */
export interface GraphAnswer {
  answer: string;
  sources: Array<{ key: string; name: string; type: EntityType }>;
  confidence: number;
}

// ============================================================
// Client-Side Entity & Relationship (decrypted)
// ============================================================

/**
 * A decrypted entity in the knowledge graph.
 * Contains the entity's content (name, summary, attributes) which is
 * stored encrypted on the server.
 */
export interface Entity {
  /** HMAC-derived entity key (64 hex chars) */
  key: string;
  /** Display name (decrypted) */
  name: string;
  /** Entity type category */
  type: EntityType;
  /** Brief description (decrypted) */
  summary: string;
  /** Arbitrary attributes (decrypted) */
  attributes: Record<string, unknown>;
  /** Server storage key (for updates/retrieval) */
  storageKey: string;
  /** When this version became valid (ISO8601) */
  validFrom: string;
  /** When this version was superseded (ISO8601), null if current */
  validTo: string | null;
  /** Version number */
  version: number;
}

/**
 * A decrypted relationship between two entities.
 * Content is encrypted on the server; structure (from/to keys) is in plaintext metadata.
 */
export interface Relationship {
  /** HMAC-derived key of the source entity */
  fromKey: string;
  /** HMAC-derived key of the target entity */
  toKey: string;
  /** Relationship type */
  type: RelationshipType;
  /** Human-readable description (decrypted) */
  description: string;
  /** Arbitrary attributes (decrypted) */
  attributes: Record<string, unknown>;
  /** Server storage key */
  storageKey: string;
  /** When this relationship became valid (ISO8601) */
  validFrom: string;
  /** When this relationship was invalidated (ISO8601), null if current */
  validTo: string | null;
  /** Version number */
  version: number;
}

// ============================================================
// Service Method Parameters
// ============================================================

/**
 * Parameters for graph.load()
 */
export interface GraphLoadParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Filter to specific entity types */
  entityTypes?: EntityType[];
  /** Load graph as it existed at this point in time (ISO8601) */
  validAt?: string;
}

/**
 * Parameters for graph.extract()
 */
export interface GraphExtractParams {
  /** Agent execution trace to analyze */
  trace: string | object;
  /** LLM configuration for extraction */
  llmConfig: LLMConfig;
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Extraction options */
  options?: {
    /** Domain hint for better extraction (e.g., 'customer-support') */
    contextHint?: string;
    /** Minimum confidence threshold (0-1) */
    confidenceThreshold?: number;
    /** Maximum entities to extract per trace */
    maxEntities?: number;
  };
}

/**
 * Parameters for graph.query() — loads a subgraph around a starting entity
 */
export interface GraphQueryParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Starting entity (raw name — SDK will derive HMAC key) */
  startEntity: string;
  /** How many hops from the start entity (default: 2) */
  depth?: number;
  /** Filter to specific relationship types */
  relationshipTypes?: RelationshipType[];
  /** Query as of this point in time (ISO8601) */
  validAt?: string;
}

/**
 * Parameters for graph.ask() — natural language query over the graph
 */
export interface GraphAskParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Natural language question */
  question: string;
  /** LLM configuration for answering */
  llmConfig: LLMConfig;
}

/**
 * Parameters for graph.addEntity()
 */
export interface AddEntityParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Entity display name */
  name: string;
  /** Entity type */
  type: EntityType;
  /** Brief description */
  summary?: string;
  /** Arbitrary attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Parameters for graph.addRelationship()
 */
export interface AddRelationshipParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Source entity (raw name — SDK will derive HMAC key) */
  from: string;
  /** Target entity (raw name — SDK will derive HMAC key) */
  to: string;
  /** Relationship type */
  type: RelationshipType;
  /** Human-readable description */
  description?: string;
  /** Arbitrary attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Parameters for graph.mergeEntities()
 */
export interface MergeEntitiesParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Entity to merge FROM (will be superseded) */
  sourceName: string;
  /** Entity to merge INTO (will be updated) */
  targetName: string;
  /** Optional LLM config for intelligent attribute merging */
  llmConfig?: LLMConfig;
}

/**
 * Parameters for graph.getEntityAt() — point-in-time entity lookup
 */
export interface EntityAtParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Entity name (raw — SDK derives HMAC key) */
  name: string;
  /** Point in time to query (ISO8601) */
  at: string;
}

/**
 * Parameters for graph.getEntityHistory() — all versions of an entity
 */
export interface EntityHistoryParams {
  /** Subject context for scoping */
  subject: SubjectContext;
  /** Entity name (raw — SDK derives HMAC key) */
  name: string;
}
