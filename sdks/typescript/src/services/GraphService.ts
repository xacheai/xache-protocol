/**
 * GraphService — Knowledge graph built on encrypted memory primitives
 *
 * Orchestrates extraction, storage, retrieval, and graph construction.
 * The server stores encrypted entities/relationships as memories.
 * All graph logic (traversal, merging, resolution) happens here client-side.
 */

import type { XacheClient } from '../XacheClient';
import type { SubjectContext, LLMConfig } from '../types';
import {
  deriveEntityKey,
  batchDeriveEntityKeys,
} from '../crypto/subject';
import { Graph } from '../graph/GraphEngine';
import { StandardContexts } from '../constants/StandardContexts';
import type {
  Entity,
  Relationship,
  GraphLoadParams,
  GraphExtractParams,
  GraphQueryParams,
  GraphAskParams,
  AddEntityParams,
  AddRelationshipParams,
  MergeEntitiesParams,
  EntityAtParams,
  EntityHistoryParams,
  GraphExtractionResult,
  GraphExtractionTemporalUpdate,
  GraphAnswer,
  EntityType,
} from '../graph/types';

/** Graph context constants for memory storage */
const GRAPH_ENTITY = StandardContexts.GRAPH_ENTITY;
const GRAPH_RELATIONSHIP = StandardContexts.GRAPH_RELATIONSHIP;

/**
 * GraphService provides a privacy-preserving knowledge graph over Xache's
 * encrypted memory storage. Entities and relationships are stored as
 * standard encrypted memories with HMAC-derived keys in plaintext metadata
 * for graph structure discovery.
 *
 * @example
 * ```typescript
 * const client = new XacheClient({ ... });
 *
 * // Extract entities from agent trace
 * const result = await client.graph.extract({
 *   trace: agentTrace,
 *   llmConfig: { type: 'api-key', provider: 'anthropic', apiKey },
 *   subject: { subjectId, scope: 'SUBJECT' },
 * });
 *
 * // Load and traverse the graph
 * const graph = await client.graph.load({ subject });
 * const neighbors = graph.neighbors('Alice Chen');
 * const path = graph.path('Alice Chen', 'Acme Corp');
 * ```
 */
export class GraphService {
  constructor(private readonly client: XacheClient) {}

  // ============================================================
  // Core Methods
  // ============================================================

  /**
   * Extract entities and relationships from an agent trace.
   *
   * Flow:
   * 1. Load existing entities (list = free, retrieve = batch rate)
   * 2. Build known-entities context for the LLM
   * 3. Call extraction endpoint with graph prompt
   * 4. Process results: create new entities, update existing, create relationships
   * 5. Store everything encrypted via batch store
   */
  async extract(params: GraphExtractParams): Promise<GraphExtractionResult> {
    const { trace, llmConfig, subject, options } = params;
    const encKey = await this.client.memory.getCurrentEncryptionKey();

    // 1. Load existing entities for entity resolution
    const existingEntities = await this.loadEntitiesRaw(subject);

    // 2. Build known entities summary for the prompt
    const knownEntitiesSummary = existingEntities.map((e) => ({
      key: e.key,
      type: e.type,
      name: e.name,
      summary: e.summary,
      attributes: e.attributes,
    }));

    // 3. Call extraction endpoint with graph context embedded in trace
    //    The extraction service routes through the standard x402 payment flow.
    //    We embed the known entities context into the trace so the server's
    //    LLM prompt includes entity resolution context.
    const graphTrace = {
      _graphExtraction: true,
      trace: typeof trace === 'string' ? trace : JSON.stringify(trace),
      knownEntities: knownEntitiesSummary,
    };

    const extractionResponse = await this.client.extraction.extract({
      trace: graphTrace,
      llmConfig,
      options: {
        confidenceThreshold: options?.confidenceThreshold ?? 0.5,
        contextHint: options?.contextHint
          ? `graph-extraction:${options.contextHint}`
          : 'graph-extraction',
        autoStore: false, // We handle storage ourselves
      },
    });

    // 4. Process LLM extraction results
    const resultEntities: GraphExtractionResult['entities'] = [];
    const resultRelationships: GraphExtractionResult['relationships'] = [];
    const temporalUpdates: GraphExtractionTemporalUpdate[] = [];
    const storeItems: Array<{
      data: Record<string, unknown>;
      storageTier: 'hot' | 'warm' | 'cold';
      context: string;
      tags: string[];
      metadata: Record<string, unknown>;
      subject: SubjectContext;
    }> = [];

    // Build entity key map: name -> HMAC key
    const extractedNames = extractionResponse.extractions
      .filter((e) => e.data?.entityType || e.data?.name)
      .map((e) => String(e.data.name || ''));
    const entityKeyMap = await batchDeriveEntityKeys(encKey, extractedNames);

    // Track existing entity keys for relationship resolution
    const existingKeyMap = new Map<string, Entity>();
    for (const e of existingEntities) {
      existingKeyMap.set(e.key, e);
    }

    // Process extracted entities
    for (const extraction of extractionResponse.extractions) {
      if (!extraction.data?.name) continue;

      const name = String(extraction.data.name);
      const entityType = String(extraction.data.entityType || extraction.data.type || 'concept');
      const summary = String(extraction.data.summary || '');
      const attributes = (extraction.data.attributes as Record<string, unknown>) || {};
      const entityKey = entityKeyMap.get(name.trim().toLowerCase()) ||
        await deriveEntityKey(encKey, name);

      const isExisting = existingKeyMap.has(entityKey);
      const now = new Date().toISOString();

      // Build store item
      storeItems.push({
        data: { name, summary, attributes },
        storageTier: 'hot',
        context: GRAPH_ENTITY,
        tags: [`et:${entityType}`, `ek:${entityKey}`],
        metadata: {
          entityType,
          entityKey,
          validFrom: now,
          validTo: null,
          version: isExisting ? (existingKeyMap.get(entityKey)!.version + 1) : 1,
        },
        subject,
      });

      resultEntities.push({
        key: entityKey,
        type: entityType,
        name,
        isNew: !isExisting,
        updated: isExisting,
        storageKey: '', // Will be filled after store
      });
    }

    // Process relationships from extraction response
    for (const extraction of extractionResponse.extractions) {
      if (!extraction.data?.fromEntity || !extraction.data?.toEntity) continue;

      const fromName = String(extraction.data.fromEntity);
      const toName = String(extraction.data.toEntity);
      const relType = String(extraction.data.relationType || extraction.data.type || 'related_to');
      const description = String(extraction.data.description || '');
      const attributes = (extraction.data.attributes as Record<string, unknown>) || {};

      const fromKey = entityKeyMap.get(fromName.trim().toLowerCase()) ||
        await deriveEntityKey(encKey, fromName);
      const toKey = entityKeyMap.get(toName.trim().toLowerCase()) ||
        await deriveEntityKey(encKey, toName);

      const now = new Date().toISOString();

      storeItems.push({
        data: { description, attributes },
        storageTier: 'hot',
        context: GRAPH_RELATIONSHIP,
        tags: [`rt:${relType}`, `from:${fromKey}`, `to:${toKey}`],
        metadata: {
          relationType: relType,
          fromEntityKey: fromKey,
          toEntityKey: toKey,
          validFrom: now,
          validTo: null,
          version: 1,
        },
        subject,
      });

      resultRelationships.push({
        from: fromKey,
        to: toKey,
        type: relType,
        isNew: true,
        storageKey: '', // Will be filled after store
      });
    }

    // 5. Batch store all items
    const receipts: string[] = [];
    if (storeItems.length > 0) {
      const batchResponse = await this.client.memory.storeBatch({
        items: storeItems,
      });

      // Map storage keys back to results
      if (batchResponse.results) {
        let entityIdx = 0;
        let relIdx = 0;
        for (const res of batchResponse.results) {
          if (res.storageKey) {
            if (entityIdx < resultEntities.length) {
              resultEntities[entityIdx].storageKey = res.storageKey;
              entityIdx++;
            } else if (relIdx < resultRelationships.length) {
              resultRelationships[relIdx].storageKey = res.storageKey;
              relIdx++;
            }
          }
        }
      }

      if (batchResponse.batchReceiptId) {
        receipts.push(batchResponse.batchReceiptId);
      }
    }

    return {
      entities: resultEntities,
      relationships: resultRelationships,
      temporalUpdates,
      stored: storeItems.length,
      receipts,
    };
  }

  /**
   * Load the full knowledge graph for a subject.
   *
   * Flow:
   * 1. list() entities by context (FREE - no payment)
   * 2. list() relationships by context (FREE)
   * 3. retrieveBatch() entity payloads (batch retrieve rate)
   * 4. retrieveBatch() relationship payloads (batch retrieve rate)
   * 5. Decrypt all payloads client-side
   * 6. Build and return Graph
   */
  async load(params: GraphLoadParams): Promise<Graph> {
    const { subject, entityTypes, validAt } = params;

    // 1-2. List entities and relationships (FREE)
    const [entityList, relList] = await Promise.all([
      this.client.memory.list({
        context: GRAPH_ENTITY,
        subjectId: subject.subjectId,
        scope: subject.scope,
        segmentId: subject.segmentId,
        tenantId: subject.tenantId,
        limit: 100,
      }),
      this.client.memory.list({
        context: GRAPH_RELATIONSHIP,
        subjectId: subject.subjectId,
        scope: subject.scope,
        segmentId: subject.segmentId,
        tenantId: subject.tenantId,
        limit: 100,
      }),
    ]);

    // Filter entity list items by entity type and validAt (from tags/metadata)
    let entityItems = entityList.memories;
    if (entityTypes && entityTypes.length > 0) {
      entityItems = entityItems.filter((m) => {
        const typeTag = (m.tags || []).find((t: string) => t.startsWith('et:'));
        if (!typeTag) return false;
        return entityTypes.includes(typeTag.substring(3));
      });
    }

    if (validAt) {
      const atDate = new Date(validAt);
      entityItems = entityItems.filter((m) => {
        const meta = m.metadata;
        if (!meta) return true;
        const from = meta.validFrom ? new Date(meta.validFrom as string) : new Date(0);
        const to = meta.validTo ? new Date(meta.validTo as string) : new Date('9999-12-31');
        return atDate >= from && atDate <= to;
      });
    }

    // 3-4. Retrieve payloads in batches (max 100 per batch)
    const entityKeys = entityItems.map((m) => m.storage_key);
    const relKeys = relList.memories.map((m) => m.storage_key);

    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    // Retrieve entities
    if (entityKeys.length > 0) {
      const entityBatch = await this.client.memory.retrieveBatch({
        storageKeys: entityKeys,
      });

      for (let i = 0; i < entityBatch.results.length; i++) {
        const result = entityBatch.results[i];
        if (result.error || !result.data) continue;

        const listItem = entityItems[result.index ?? i];
        const meta = listItem.metadata || {};
        const data = result.data as Record<string, unknown>;

        entities.push({
          key: String(meta.entityKey || ''),
          name: String(data.name || ''),
          type: String(meta.entityType || 'concept') as EntityType,
          summary: String(data.summary || ''),
          attributes: (data.attributes as Record<string, unknown>) || {},
          storageKey: result.storageKey || listItem.storage_key,
          validFrom: String(meta.validFrom || listItem.created_at),
          validTo: (meta.validTo as string) || null,
          version: Number(meta.version || 1),
        });
      }
    }

    // Retrieve relationships
    if (relKeys.length > 0) {
      const relBatch = await this.client.memory.retrieveBatch({
        storageKeys: relKeys,
      });

      for (let i = 0; i < relBatch.results.length; i++) {
        const result = relBatch.results[i];
        if (result.error || !result.data) continue;

        const listItem = relList.memories[result.index ?? i];
        const meta = listItem.metadata || {};
        const data = result.data as Record<string, unknown>;

        relationships.push({
          fromKey: String(meta.fromEntityKey || ''),
          toKey: String(meta.toEntityKey || ''),
          type: String(meta.relationType || 'related_to'),
          description: String(data.description || ''),
          attributes: (data.attributes as Record<string, unknown>) || {},
          storageKey: result.storageKey || listItem.storage_key,
          validFrom: String(meta.validFrom || listItem.created_at),
          validTo: (meta.validTo as string) || null,
          version: Number(meta.version || 1),
        });
      }
    }

    return new Graph(entities, relationships);
  }

  /**
   * Load a subgraph around a starting entity.
   * Loads the full graph then extracts a subgraph at the given depth.
   */
  async query(params: GraphQueryParams): Promise<Graph> {
    const { subject, startEntity, depth = 2, validAt } = params;

    const graph = await this.load({ subject, validAt });

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const entityKey = await deriveEntityKey(encKey, startEntity);

    return graph.subgraph(entityKey, depth);
  }

  /**
   * Ask a natural language question over the knowledge graph.
   * Loads the graph, builds context from entities and relationships,
   * and uses the LLM to answer.
   */
  async ask(params: GraphAskParams): Promise<GraphAnswer> {
    const { subject, question, llmConfig } = params;

    // Load the graph
    const graph = await this.load({ subject });

    if (graph.entityCount === 0) {
      return {
        answer: 'No knowledge graph data found for this subject.',
        sources: [],
        confidence: 0,
      };
    }

    // Build context from graph data
    const entityLines = graph.entities.map(
      (e) => `- ${e.name} (${e.type}): ${e.summary}`,
    );
    const relLines = graph.relationships.map((r) => {
      const fromEntity = graph.getEntity(r.fromKey);
      const toEntity = graph.getEntity(r.toKey);
      const fromName = fromEntity?.name || r.fromKey;
      const toName = toEntity?.name || r.toKey;
      return `- ${fromName} --[${r.type}]--> ${toName}: ${r.description}`;
    });

    const graphContext = [
      'ENTITIES:',
      ...entityLines,
      '',
      'RELATIONSHIPS:',
      ...relLines,
    ].join('\n');

    // Call extraction service to answer the question
    // We embed the graph context + question into the trace
    const response = await this.client.extraction.extract({
      trace: JSON.stringify({
        _graphAsk: true,
        question,
        graphContext,
      }),
      llmConfig,
      options: {
        contextHint: 'graph-ask',
        autoStore: false,
      },
    });

    // Parse the answer from extraction response
    if (response.extractions.length > 0) {
      const extraction = response.extractions[0];
      return {
        answer: String(extraction.data?.answer || extraction.reasoning || 'Unable to answer.'),
        sources: graph.entities
          .filter((e) =>
            String(extraction.data?.answer || '').toLowerCase().includes(e.name.toLowerCase()),
          )
          .map((e) => ({ key: e.key, name: e.name, type: e.type })),
        confidence: extraction.confidence || 0.5,
      };
    }

    return {
      answer: 'Unable to answer based on the available knowledge graph.',
      sources: [],
      confidence: 0,
    };
  }

  // ============================================================
  // Manual Mutations
  // ============================================================

  /**
   * Add a single entity to the knowledge graph.
   */
  async addEntity(params: AddEntityParams): Promise<Entity> {
    const { subject, name, type, summary = '', attributes = {} } = params;

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const entityKey = await deriveEntityKey(encKey, name);
    const now = new Date().toISOString();

    const result = await this.client.memory.store({
      data: { name, summary, attributes },
      storageTier: 'hot',
      context: GRAPH_ENTITY,
      tags: [`et:${type}`, `ek:${entityKey}`],
      metadata: {
        entityType: type,
        entityKey,
        validFrom: now,
        validTo: null,
        version: 1,
      },
      subject,
    });

    return {
      key: entityKey,
      name,
      type,
      summary,
      attributes,
      storageKey: result.storageKey,
      validFrom: now,
      validTo: null,
      version: 1,
    };
  }

  /**
   * Add a relationship between two entities.
   * Entities are referenced by raw name (SDK derives HMAC keys).
   */
  async addRelationship(params: AddRelationshipParams): Promise<Relationship> {
    const { subject, from, to, type, description = '', attributes = {} } = params;

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const [fromKey, toKey] = await Promise.all([
      deriveEntityKey(encKey, from),
      deriveEntityKey(encKey, to),
    ]);

    const now = new Date().toISOString();

    const result = await this.client.memory.store({
      data: { description, attributes },
      storageTier: 'hot',
      context: GRAPH_RELATIONSHIP,
      tags: [`rt:${type}`, `from:${fromKey}`, `to:${toKey}`],
      metadata: {
        relationType: type,
        fromEntityKey: fromKey,
        toEntityKey: toKey,
        validFrom: now,
        validTo: null,
        version: 1,
      },
      subject,
    });

    return {
      fromKey,
      toKey,
      type,
      description,
      attributes,
      storageKey: result.storageKey,
      validFrom: now,
      validTo: null,
      version: 1,
    };
  }

  /**
   * Merge two entities into one.
   * Source entity is superseded; target entity absorbs source's attributes.
   * All relationships pointing to source are updated to point to target.
   */
  async mergeEntities(params: MergeEntitiesParams): Promise<Entity> {
    const { subject, sourceName, targetName, llmConfig } = params;

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const [sourceKey, targetKey] = await Promise.all([
      deriveEntityKey(encKey, sourceName),
      deriveEntityKey(encKey, targetName),
    ]);

    // Load graph to find both entities and their relationships
    const graph = await this.load({ subject });
    const sourceEntity = graph.getEntity(sourceKey);
    const targetEntity = graph.getEntity(targetKey);

    if (!sourceEntity) {
      throw new Error(`Source entity "${sourceName}" not found`);
    }
    if (!targetEntity) {
      throw new Error(`Target entity "${targetName}" not found`);
    }

    // Merge attributes (target wins on conflicts, source fills gaps)
    const mergedAttributes = { ...sourceEntity.attributes, ...targetEntity.attributes };
    const mergedSummary = targetEntity.summary || sourceEntity.summary;
    const now = new Date().toISOString();

    // Store updated target entity (new version)
    const storeResult = await this.client.memory.store({
      data: {
        name: targetEntity.name,
        summary: mergedSummary,
        attributes: mergedAttributes,
      },
      storageTier: 'hot',
      context: GRAPH_ENTITY,
      tags: [`et:${targetEntity.type}`, `ek:${targetKey}`],
      metadata: {
        entityType: targetEntity.type,
        entityKey: targetKey,
        validFrom: now,
        validTo: null,
        version: targetEntity.version + 1,
      },
      subject,
    });

    // Mark source entity as superseded by storing a new version with validTo set
    await this.client.memory.store({
      data: {
        name: sourceEntity.name,
        summary: sourceEntity.summary,
        attributes: sourceEntity.attributes,
      },
      storageTier: 'hot',
      context: GRAPH_ENTITY,
      tags: [`et:${sourceEntity.type}`, `ek:${sourceKey}`],
      metadata: {
        entityType: sourceEntity.type,
        entityKey: sourceKey,
        validFrom: sourceEntity.validFrom,
        validTo: now,
        version: sourceEntity.version + 1,
        supersededBy: storeResult.storageKey,
      },
      subject,
    });

    return {
      key: targetKey,
      name: targetEntity.name,
      type: targetEntity.type,
      summary: mergedSummary,
      attributes: mergedAttributes,
      storageKey: storeResult.storageKey,
      validFrom: now,
      validTo: null,
      version: targetEntity.version + 1,
    };
  }

  // ============================================================
  // Temporal Methods
  // ============================================================

  /**
   * Get an entity as it existed at a specific point in time.
   */
  async getEntityAt(params: EntityAtParams): Promise<Entity | null> {
    const { subject, name, at } = params;

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const entityKey = await deriveEntityKey(encKey, name);

    // Load all versions of this entity
    const history = await this.loadEntityVersions(subject, entityKey);
    const atDate = new Date(at);

    // Find the version valid at the given time
    for (const entity of history) {
      const from = new Date(entity.validFrom);
      const to = entity.validTo ? new Date(entity.validTo) : new Date('9999-12-31');
      if (atDate >= from && atDate <= to) {
        return entity;
      }
    }

    return null;
  }

  /**
   * Get the full version history of an entity.
   */
  async getEntityHistory(params: EntityHistoryParams): Promise<Entity[]> {
    const { subject, name } = params;

    const encKey = await this.client.memory.getCurrentEncryptionKey();
    const entityKey = await deriveEntityKey(encKey, name);

    return this.loadEntityVersions(subject, entityKey);
  }

  // ============================================================
  // Utility
  // ============================================================

  /**
   * Derive an HMAC entity key from a raw entity name.
   * Useful for pre-computing keys without storing entities.
   */
  async deriveEntityKey(name: string): Promise<string> {
    const encKey = await this.client.memory.getCurrentEncryptionKey();
    return deriveEntityKey(encKey, name);
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Load existing entities (decrypted) for a subject.
   * Used internally for entity resolution during extraction.
   */
  private async loadEntitiesRaw(subject: SubjectContext): Promise<Entity[]> {
    const entityList = await this.client.memory.list({
      context: GRAPH_ENTITY,
      subjectId: subject.subjectId,
      scope: subject.scope,
      segmentId: subject.segmentId,
      tenantId: subject.tenantId,
      limit: 100,
    });

    if (entityList.memories.length === 0) {
      return [];
    }

    const storageKeys = entityList.memories.map((m) => m.storage_key);
    const batch = await this.client.memory.retrieveBatch({ storageKeys });

    const entities: Entity[] = [];
    for (let i = 0; i < batch.results.length; i++) {
      const result = batch.results[i];
      if (result.error || !result.data) continue;

      const listItem = entityList.memories[result.index ?? i];
      const meta = listItem.metadata || {};
      const data = result.data as Record<string, unknown>;

      entities.push({
        key: String(meta.entityKey || ''),
        name: String(data.name || ''),
        type: String(meta.entityType || 'concept') as EntityType,
        summary: String(data.summary || ''),
        attributes: (data.attributes as Record<string, unknown>) || {},
        storageKey: result.storageKey || listItem.storage_key,
        validFrom: String(meta.validFrom || listItem.created_at),
        validTo: (meta.validTo as string) || null,
        version: Number(meta.version || 1),
      });
    }

    return entities;
  }

  /**
   * Load all versions of a specific entity by its HMAC key.
   */
  private async loadEntityVersions(
    subject: SubjectContext,
    entityKey: string,
  ): Promise<Entity[]> {
    // List all memories with this entity key tag
    const entityList = await this.client.memory.list({
      context: GRAPH_ENTITY,
      subjectId: subject.subjectId,
      scope: subject.scope,
      segmentId: subject.segmentId,
      tenantId: subject.tenantId,
      limit: 100,
    });

    // Filter to matching entity key via tags
    const matching = entityList.memories.filter((m) =>
      (m.tags || []).some((t: string) => t === `ek:${entityKey}`),
    );

    if (matching.length === 0) return [];

    const storageKeys = matching.map((m) => m.storage_key);
    const batch = await this.client.memory.retrieveBatch({ storageKeys });

    const entities: Entity[] = [];
    for (let i = 0; i < batch.results.length; i++) {
      const result = batch.results[i];
      if (result.error || !result.data) continue;

      const listItem = matching[result.index ?? i];
      const meta = listItem.metadata || {};
      const data = result.data as Record<string, unknown>;

      entities.push({
        key: String(meta.entityKey || entityKey),
        name: String(data.name || ''),
        type: String(meta.entityType || 'concept') as EntityType,
        summary: String(data.summary || ''),
        attributes: (data.attributes as Record<string, unknown>) || {},
        storageKey: result.storageKey || listItem.storage_key,
        validFrom: String(meta.validFrom || listItem.created_at),
        validTo: (meta.validTo as string) || null,
        version: Number(meta.version || 1),
      });
    }

    // Sort by version (oldest first)
    entities.sort((a, b) => a.version - b.version);

    return entities;
  }
}
