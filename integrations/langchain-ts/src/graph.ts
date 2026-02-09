/**
 * Xache Knowledge Graph for LangChain.js
 * Extract, query, and manage entities/relationships in a privacy-preserving knowledge graph
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseRetriever, BaseRetrieverInput } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { z } from 'zod';
import {
  XacheClient,
  DID,
  type LLMProvider,
  type LLMApiFormat,
  type SubjectContext,
  type XacheSigner,
  type XacheWalletProvider,
} from '@xache/sdk';

// =============================================================================
// Configuration
// =============================================================================

export interface GraphToolConfig {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing (optional if signer or walletProvider is provided) */
  privateKey?: string;
  /** External signer (alternative to privateKey) */
  signer?: XacheSigner;
  /** Wallet provider for lazy signer resolution */
  walletProvider?: XacheWalletProvider;
  /** Encryption key for use with external signers */
  encryptionKey?: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
  /** Subject context for graph scoping (defaults to GLOBAL) */
  subject?: SubjectContext;
  /** LLM provider for extract/ask (api-key mode) */
  llmProvider?: LLMProvider;
  /** LLM API key */
  llmApiKey?: string;
  /** LLM model override */
  llmModel?: string;
  /** LLM endpoint URL (endpoint mode) */
  llmEndpoint?: string;
  /** LLM auth token (endpoint mode) */
  llmAuthToken?: string;
  /** LLM API format (endpoint mode, default: openai) */
  llmFormat?: LLMApiFormat;
}

function createClient(config: GraphToolConfig): XacheClient {
  const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
  const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

  return new XacheClient({
    apiUrl: config.apiUrl || 'https://api.xache.xyz',
    did,
    privateKey: config.privateKey,
    signer: config.signer,
    walletProvider: config.walletProvider,
    encryptionKey: config.encryptionKey,
  });
}

function getSubject(config: GraphToolConfig): SubjectContext {
  return config.subject || { scope: 'GLOBAL' };
}

function buildLLMConfig(config: GraphToolConfig): Record<string, unknown> {
  if (config.llmEndpoint) {
    return {
      type: 'endpoint' as const,
      url: config.llmEndpoint,
      authToken: config.llmAuthToken,
      format: config.llmFormat || 'openai',
      model: config.llmModel,
    };
  } else if (config.llmApiKey && config.llmProvider) {
    return {
      type: 'api-key' as const,
      provider: config.llmProvider,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    };
  } else {
    return {
      type: 'xache-managed' as const,
      provider: 'anthropic',
      model: config.llmModel,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tool for extracting entities/relationships from agent traces.
 *
 * @example
 * ```typescript
 * const extractTool = createGraphExtractTool({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 *   llmProvider: 'anthropic',
 *   llmApiKey: 'sk-ant-...',
 * });
 * ```
 */
export function createGraphExtractTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_extract',
    description:
      'Extract entities and relationships from text into the knowledge graph. ' +
      'Identifies people, organizations, tools, concepts and their connections.',
    schema: z.object({
      trace: z.string().describe('The text/trace to extract entities from'),
      contextHint: z.string().optional().describe('Domain hint (e.g., "engineering", "customer-support")'),
    }),
    func: async ({ trace, contextHint }) => {
      const result = await client.graph.extract({
        trace,
        llmConfig: buildLLMConfig(config) as any,
        subject,
        options: {
          contextHint,
          confidenceThreshold: 0.7,
        },
      });

      const entities = result.entities || [];
      const relationships = result.relationships || [];

      if (entities.length === 0 && relationships.length === 0) {
        return 'No entities or relationships extracted.';
      }

      let output = `Extracted ${entities.length} entities, ${relationships.length} relationships.\n`;
      for (const e of entities) {
        output += `  Entity: ${e.name} [${e.type}]${e.isNew ? ' (new)' : ''}\n`;
      }
      for (const r of relationships) {
        output += `  Rel: ${r.from} → ${r.type} → ${r.to}\n`;
      }
      return output;
    },
  });
}

/**
 * Create a tool for querying the knowledge graph around a specific entity.
 */
export function createGraphQueryTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_query',
    description:
      'Query the knowledge graph around a specific entity. ' +
      'Returns connected entities and relationships within the specified depth.',
    schema: z.object({
      startEntity: z.string().describe('Name of the entity to start from'),
      depth: z.number().optional().default(2).describe('Number of hops (default: 2)'),
    }),
    func: async ({ startEntity, depth }) => {
      const graph = await client.graph.query({
        subject,
        startEntity,
        depth: depth || 2,
      });

      const data = graph.toJSON();
      if (data.entities.length === 0) {
        return `No entities found connected to "${startEntity}".`;
      }

      let output = `Subgraph: ${data.entities.length} entities, ${data.relationships.length} relationships\n`;
      for (const e of data.entities) {
        output += `  ${e.name} [${e.type}]`;
        if (e.summary) output += ` — ${e.summary.substring(0, 80)}`;
        output += '\n';
      }
      return output;
    },
  });
}

/**
 * Create a tool for asking natural language questions about the knowledge graph.
 */
export function createGraphAskTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_ask',
    description:
      'Ask a natural language question about the knowledge graph. ' +
      'Uses LLM to analyze entities and relationships and provide an answer.',
    schema: z.object({
      question: z.string().describe('The question to ask about the knowledge graph'),
    }),
    func: async ({ question }) => {
      const answer = await client.graph.ask({
        subject,
        question,
        llmConfig: buildLLMConfig(config) as any,
      });

      let output = `Answer: ${answer.answer}\nConfidence: ${(answer.confidence * 100).toFixed(0)}%`;
      if (answer.sources?.length > 0) {
        output += '\nSources: ' + answer.sources.map(s => `${s.name} [${s.type}]`).join(', ');
      }
      return output;
    },
  });
}

/**
 * Create a tool for adding entities to the knowledge graph.
 */
export function createGraphAddEntityTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_add_entity',
    description:
      'Add an entity to the knowledge graph. ' +
      'Creates a person, organization, tool, concept, or other entity type.',
    schema: z.object({
      name: z.string().describe('Entity name'),
      type: z.string().describe('Entity type (person, organization, tool, concept, etc.)'),
      summary: z.string().optional().describe('Brief description'),
      attributes: z.record(z.string(), z.unknown()).optional().describe('Key-value attributes'),
    }),
    func: async ({ name, type, summary, attributes }) => {
      const entity = await client.graph.addEntity({
        subject,
        name,
        type,
        summary,
        attributes,
      });
      return `Created entity "${entity.name}" [${entity.type}], key: ${entity.key}`;
    },
  });
}

/**
 * Create a tool for adding relationships between entities.
 */
export function createGraphAddRelationshipTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_add_relationship',
    description:
      'Create a relationship between two entities in the knowledge graph.',
    schema: z.object({
      from: z.string().describe('Source entity name'),
      to: z.string().describe('Target entity name'),
      type: z.string().describe('Relationship type (works_at, knows, uses, manages, etc.)'),
      description: z.string().optional().describe('Relationship description'),
    }),
    func: async ({ from, to, type, description }) => {
      const rel = await client.graph.addRelationship({
        subject,
        from,
        to,
        type,
        description,
      });
      return `Created relationship: ${from} → ${rel.type} → ${to}`;
    },
  });
}

/**
 * Create a tool for loading the full knowledge graph.
 */
export function createGraphLoadTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_load',
    description:
      'Load the full knowledge graph. Returns all entities and relationships. ' +
      'Optionally filter by entity type or load a historical snapshot.',
    schema: z.object({
      entityTypes: z.array(z.string()).optional().describe('Filter to specific entity types'),
      validAt: z.string().optional().describe('Load graph as it existed at this time (ISO8601)'),
    }),
    func: async ({ entityTypes, validAt }) => {
      const graph = await client.graph.load({
        subject,
        entityTypes,
        validAt,
      });

      const data = graph.toJSON();
      if (data.entities.length === 0) {
        return 'Knowledge graph is empty.';
      }

      let output = `Knowledge graph: ${data.entities.length} entities, ${data.relationships.length} relationships\n`;
      for (const e of data.entities) {
        output += `  ${e.name} [${e.type}]`;
        if (e.summary) output += ` — ${e.summary.substring(0, 80)}`;
        output += '\n';
      }
      return output;
    },
  });
}

/**
 * Create a tool for merging two entities in the knowledge graph.
 */
export function createGraphMergeEntitiesTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_merge_entities',
    description:
      'Merge two entities into one. The source entity is superseded and the target ' +
      'entity is updated with merged attributes. Relationships are transferred.',
    schema: z.object({
      sourceName: z.string().describe('Entity to merge FROM (will be superseded)'),
      targetName: z.string().describe('Entity to merge INTO (will be updated)'),
    }),
    func: async ({ sourceName, targetName }) => {
      const merged = await client.graph.mergeEntities({
        subject,
        sourceName,
        targetName,
      });
      return `Merged "${sourceName}" into "${targetName}". Result: ${merged.name} [${merged.type}] (v${merged.version})`;
    },
  });
}

/**
 * Create a tool for getting the version history of an entity.
 */
export function createGraphEntityHistoryTool(
  config: GraphToolConfig
): DynamicStructuredTool {
  const client = createClient(config);
  const subject = getSubject(config);

  return new DynamicStructuredTool({
    name: 'xache_graph_entity_history',
    description:
      'Get the full version history of an entity. Shows how the entity has changed over time.',
    schema: z.object({
      name: z.string().describe('Entity name to look up history for'),
    }),
    func: async ({ name }) => {
      const versions = await client.graph.getEntityHistory({
        subject,
        name,
      });

      if (versions.length === 0) {
        return `No history found for entity "${name}".`;
      }

      let output = `History for "${name}": ${versions.length} version(s)\n`;
      for (const v of versions) {
        output += `  v${v.version} — ${v.name} [${v.type}]`;
        if (v.summary) output += ` | ${v.summary.substring(0, 80)}`;
        output += `\n    Valid: ${v.validFrom}${v.validTo ? ` → ${v.validTo}` : ' → current'}\n`;
      }
      return output;
    },
  });
}

// =============================================================================
// Class Wrappers
// =============================================================================

/**
 * Class wrapper for graph extract tool
 */
export class XacheGraphExtractTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphExtractTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class wrapper for graph query tool
 */
export class XacheGraphQueryTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphQueryTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class wrapper for graph ask tool
 */
export class XacheGraphAskTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphAskTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class wrapper for graph load tool
 */
export class XacheGraphLoadTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphLoadTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class wrapper for graph merge entities tool
 */
export class XacheGraphMergeEntitiesTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphMergeEntitiesTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class wrapper for graph entity history tool
 */
export class XacheGraphEntityHistoryTool {
  private tool: DynamicStructuredTool;

  constructor(config: GraphToolConfig) {
    this.tool = createGraphEntityHistoryTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

// =============================================================================
// Graph Retriever
// =============================================================================

export interface XacheGraphRetrieverConfig extends BaseRetrieverInput {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing (optional if signer or walletProvider is provided) */
  privateKey?: string;
  /** External signer (alternative to privateKey) */
  signer?: XacheSigner;
  /** Wallet provider for lazy signer resolution */
  walletProvider?: XacheWalletProvider;
  /** Encryption key for use with external signers */
  encryptionKey?: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
  /** Subject context for graph scoping */
  subject?: SubjectContext;
  /** Starting entity for subgraph query (optional — if not set, loads full graph) */
  startEntity?: string;
  /** Depth for subgraph query (default: 2) */
  depth?: number;
  /** Max results to return */
  k?: number;
}

/**
 * Retriever that fetches documents from the Xache knowledge graph.
 * Each entity becomes a Document with its name, type, and summary.
 *
 * @example
 * ```typescript
 * const retriever = new XacheGraphRetriever({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 *   k: 10,
 * });
 *
 * const docs = await retriever.getRelevantDocuments('engineering team');
 * ```
 */
export class XacheGraphRetriever extends BaseRetriever {
  lc_namespace = ['xache', 'graph_retriever'];

  static lc_name() {
    return 'XacheGraphRetriever';
  }

  private client: XacheClient;
  private subject: SubjectContext;
  private startEntity?: string;
  private depth: number;
  private k: number;

  constructor(config: XacheGraphRetrieverConfig) {
    super(config);

    const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
    const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

    this.client = new XacheClient({
      apiUrl: config.apiUrl || 'https://api.xache.xyz',
      did,
      privateKey: config.privateKey,
      signer: config.signer,
      walletProvider: config.walletProvider,
      encryptionKey: config.encryptionKey,
    });

    this.subject = config.subject || { scope: 'GLOBAL' };
    this.startEntity = config.startEntity;
    this.depth = config.depth ?? 2;
    this.k = config.k ?? 10;
  }

  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    // Load graph (full or subgraph)
    let graph;
    if (this.startEntity) {
      graph = await this.client.graph.query({
        subject: this.subject,
        startEntity: this.startEntity,
        depth: this.depth,
      });
    } else {
      graph = await this.client.graph.load({ subject: this.subject });
    }

    const data = graph.toJSON();
    const queryLower = query.toLowerCase();

    // Score entities by relevance to query
    const scored = data.entities.map(entity => {
      let score = 0;
      const nameLower = entity.name.toLowerCase();
      const summaryLower = (entity.summary || '').toLowerCase();

      if (nameLower.includes(queryLower)) score += 3;
      if (summaryLower.includes(queryLower)) score += 2;

      // Check individual query terms
      const terms = queryLower.split(/\s+/);
      for (const term of terms) {
        if (nameLower.includes(term)) score += 1;
        if (summaryLower.includes(term)) score += 0.5;
      }

      return { entity, score };
    });

    // Sort by score, take top k
    scored.sort((a, b) => b.score - a.score);
    const topEntities = scored.slice(0, this.k);

    return topEntities.map(({ entity }) => {
      const content = [
        `Name: ${entity.name}`,
        `Type: ${entity.type}`,
        entity.summary ? `Summary: ${entity.summary}` : null,
      ].filter(Boolean).join('\n');

      return new Document({
        pageContent: content,
        metadata: {
          source: 'xache-graph',
          entityKey: entity.key,
          entityName: entity.name,
          entityType: entity.type,
          storageKey: entity.storageKey,
        },
      });
    });
  }
}
