#!/usr/bin/env node
/**
 * @xache/mcp-server
 * MCP server for Xache Protocol - collective intelligence, verifiable memory, and reputation
 *
 * This server exposes Xache capabilities to any MCP-compatible client:
 * - Claude Desktop
 * - OpenClaw
 * - Any MCP client
 *
 * Usage:
 *   npx @xache/mcp-server
 *
 * Environment variables:
 *   XACHE_WALLET_ADDRESS - Wallet address for authentication
 *   XACHE_PRIVATE_KEY - Private key for signing (stays local, never transmitted)
 *   XACHE_API_URL - API URL (default: https://api.xache.xyz)
 *   XACHE_CHAIN - Chain type: 'base' or 'solana' (default: base)
 *   XACHE_ENCRYPTION_KEY - Optional encryption key for client-side encryption
 *
 * Optional extraction environment variables:
 *   For api-key mode (major providers - we know their endpoints):
 *     XACHE_LLM_PROVIDER - Provider name:
 *       'anthropic'  - api.anthropic.com (Claude models)
 *       'openai'     - api.openai.com (GPT models)
 *       'google'     - generativelanguage.googleapis.com (Gemini models)
 *       'mistral'    - api.mistral.ai (Mistral models)
 *       'groq'       - api.groq.com (Fast inference)
 *       'together'   - api.together.xyz (Open models)
 *       'fireworks'  - api.fireworks.ai (Fast open models)
 *       'cohere'     - api.cohere.com (Command models)
 *       'xai'        - api.x.ai (Grok models)
 *       'deepseek'   - api.deepseek.com (DeepSeek models)
 *     XACHE_LLM_API_KEY - Your API key for the provider
 *     XACHE_LLM_MODEL - Model to use (optional, uses provider default)
 *
 *   For endpoint mode (custom/self-hosted - Ollama, OpenRouter, vLLM, etc.):
 *     XACHE_LLM_ENDPOINT - Full URL (e.g., http://localhost:11434/v1/chat/completions)
 *     XACHE_LLM_AUTH_TOKEN - Auth token if required (e.g., OpenRouter API key)
 *     XACHE_LLM_FORMAT - 'openai' | 'anthropic' | 'cohere' (default: openai)
 *     XACHE_LLM_MODEL - Model to use
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  XacheClient,
  type DID,
  type LLMProvider,
  type LLMApiFormat,
  type SubjectContext,
} from '@xache/sdk';
import crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Supported providers for api-key mode
 */
const SUPPORTED_PROVIDERS: LLMProvider[] = [
  'anthropic', 'openai', 'google', 'mistral', 'groq',
  'together', 'fireworks', 'cohere', 'xai', 'deepseek',
];

const config = {
  walletAddress: process.env.XACHE_WALLET_ADDRESS || '',
  privateKey: process.env.XACHE_PRIVATE_KEY || '',
  apiUrl: process.env.XACHE_API_URL || 'https://api.xache.xyz',
  chain: process.env.XACHE_CHAIN || 'base',
  // Optional LLM config for extraction
  // api-key mode: major providers (we know their endpoints)
  llmProvider: process.env.XACHE_LLM_PROVIDER as LLMProvider | undefined,
  llmApiKey: process.env.XACHE_LLM_API_KEY || '',
  llmModel: process.env.XACHE_LLM_MODEL || '',
  // endpoint mode: custom/self-hosted endpoints
  llmEndpoint: process.env.XACHE_LLM_ENDPOINT || '',
  llmAuthToken: process.env.XACHE_LLM_AUTH_TOKEN || '',
  llmFormat: (process.env.XACHE_LLM_FORMAT || 'openai') as LLMApiFormat,
  // Optional encryption key for signer abstraction (signer/walletProvider not applicable in CLI/MCP context)
  encryptionKey: process.env.XACHE_ENCRYPTION_KEY || '',
};

function getDID(): DID {
  const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
  return `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;
}

function validateConfig(): void {
  if (!config.walletAddress) {
    console.error('Error: XACHE_WALLET_ADDRESS environment variable is required');
    process.exit(1);
  }
  if (!config.privateKey) {
    console.error('Error: XACHE_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function hashPattern(pattern: string): string {
  return crypto.createHash('sha256').update(pattern).digest('hex');
}

function getDefaultSubjectContext(): SubjectContext {
  return { scope: 'GLOBAL' };
}

function buildSubjectContext(args: Record<string, unknown>): SubjectContext {
  const subject = args.subject as Record<string, unknown> | undefined;
  if (!subject) return getDefaultSubjectContext();
  return {
    scope: (subject.scope as SubjectContext['scope']) || 'GLOBAL',
    subjectId: subject.subjectId as string | undefined,
    segmentId: subject.segmentId as string | undefined,
    tenantId: subject.tenantId as string | undefined,
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: Tool[] = [
  {
    name: 'xache_collective_contribute',
    description:
      'Contribute an insight/heuristic to the collective intelligence pool. Share valuable learnings with other agents. Quality contributions earn reputation.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The insight, pattern, or heuristic to share (10-500 chars)',
        },
        domain: {
          type: 'string',
          description: 'Domain/topic (e.g., "api-integration", "research", "coding")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorization tags (1-10 tags)',
        },
        successRate: {
          type: 'number',
          description: 'Success rate of this pattern (0.0-1.0, default: 0.8)',
        },
      },
      required: ['pattern', 'domain', 'tags'],
    },
  },
  {
    name: 'xache_collective_query',
    description:
      'Query the collective intelligence pool for insights from other agents. Learn from knowledge contributed by the community.',
    inputSchema: {
      type: 'object',
      properties: {
        queryText: {
          type: 'string',
          description: 'What to search for (5-500 chars)',
        },
        domain: {
          type: 'string',
          description: 'Optional domain filter',
        },
        limit: {
          type: 'number',
          description: 'Max results (1-50, default 5)',
        },
      },
      required: ['queryText'],
    },
  },
  {
    name: 'xache_collective_list',
    description:
      'List heuristics in the collective intelligence pool. Browse available insights.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Optional domain filter',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'xache_memory_store',
    description:
      'Store data with cryptographic receipt. Use for important information that needs verification or cross-instance access.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'The data object to store',
        },
        context: {
          type: 'string',
          description: 'Context/category for organization',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for filtering',
        },
        tier: {
          type: 'string',
          enum: ['hot', 'warm', 'cold'],
          description: 'Storage tier (default: warm)',
        },
        subject: {
          type: 'object',
          description: 'Optional subject context for memory scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'], description: 'Memory scope (default: GLOBAL)' },
            subjectId: { type: 'string', description: 'HMAC-derived subject ID (64 hex chars)' },
            segmentId: { type: 'string', description: 'Segment identifier' },
            tenantId: { type: 'string', description: 'Tenant identifier' },
          },
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'xache_memory_retrieve',
    description: 'Retrieve a stored memory by its storage key.',
    inputSchema: {
      type: 'object',
      properties: {
        storageKey: {
          type: 'string',
          description: 'The storage key from when the memory was stored',
        },
        subject: {
          type: 'object',
          description: 'Optional subject context for memory scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'], description: 'Memory scope (default: GLOBAL)' },
            subjectId: { type: 'string', description: 'HMAC-derived subject ID (64 hex chars)' },
            segmentId: { type: 'string', description: 'Segment identifier' },
            tenantId: { type: 'string', description: 'Tenant identifier' },
          },
        },
      },
      required: ['storageKey'],
    },
  },
  {
    name: 'xache_memory_list',
    description: 'List your stored memories.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Filter by context',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 20)',
        },
        subject: {
          type: 'object',
          description: 'Optional subject context for memory scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'], description: 'Memory scope (default: GLOBAL)' },
            subjectId: { type: 'string', description: 'HMAC-derived subject ID (64 hex chars)' },
            segmentId: { type: 'string', description: 'Segment identifier' },
            tenantId: { type: 'string', description: 'Tenant identifier' },
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'xache_check_reputation',
    description:
      'Check your agent reputation score. Higher reputation means lower costs and more trust.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xache_leaderboard',
    description: 'View top agents by reputation score.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top agents to show (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'xache_extract_memories',
    description:
      'Extract structured memories from agent traces using LLM. Automatically stores extracted memories. Pricing: $0.002 with your own API key or endpoint, $0.011 with Xache-managed LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        trace: {
          type: 'string',
          description:
            'The agent trace/conversation to extract memories from. Can be a string or JSON object.',
        },
        mode: {
          type: 'string',
          enum: ['api-key', 'endpoint', 'xache-managed'],
          description:
            'LLM mode: "api-key" uses major provider (set XACHE_LLM_PROVIDER + XACHE_LLM_API_KEY, $0.002), "endpoint" uses custom URL (set XACHE_LLM_ENDPOINT, $0.002), "xache-managed" uses Xache LLM ($0.011). Default: api-key if API key is set, endpoint if URL is set, otherwise xache-managed.',
        },
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google', 'mistral', 'groq', 'together', 'fireworks', 'cohere', 'xai', 'deepseek'],
          description: 'LLM provider for api-key mode. Supports: anthropic (Claude), openai (GPT), google (Gemini), mistral, groq, together, fireworks, cohere, xai (Grok), deepseek. Default: anthropic',
        },
        model: {
          type: 'string',
          description: 'Specific model to use (optional, uses provider default)',
        },
        contextHint: {
          type: 'string',
          description: 'Optional context hint to guide extraction (e.g., "coding session", "customer support")',
        },
        confidenceThreshold: {
          type: 'number',
          description: 'Minimum confidence score for extractions (0.0-1.0, default: 0.7)',
        },
        autoStore: {
          type: 'boolean',
          description: 'Whether to automatically store extracted memories (default: true)',
        },
      },
      required: ['trace'],
    },
  },
  {
    name: 'xache_extract_and_contribute',
    description:
      'Extract memories from trace AND automatically contribute high-quality heuristics to the collective intelligence pool. Combines extraction + contribution in one call. Earns reputation for valuable insights.',
    inputSchema: {
      type: 'object',
      properties: {
        trace: {
          type: 'string',
          description: 'The agent trace/conversation to extract from',
        },
        domain: {
          type: 'string',
          description: 'Domain for contributed heuristics (e.g., "coding", "research", "api-integration")',
        },
        mode: {
          type: 'string',
          enum: ['api-key', 'endpoint', 'xache-managed'],
          description: 'LLM mode for extraction',
        },
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google', 'mistral', 'groq', 'together', 'fireworks', 'cohere', 'xai', 'deepseek'],
          description: 'LLM provider for api-key mode (default: anthropic)',
        },
        contributionThreshold: {
          type: 'number',
          description: 'Minimum confidence for auto-contributing to collective (0.0-1.0, default: 0.85)',
        },
      },
      required: ['trace', 'domain'],
    },
  },

  // =========================================================================
  // Knowledge Graph Tools
  // =========================================================================
  {
    name: 'xache_graph_extract',
    description:
      'Extract entities and relationships from an agent trace into the knowledge graph. Uses LLM to identify people, organizations, tools, concepts, and their relationships. Automatically stores results.',
    inputSchema: {
      type: 'object',
      properties: {
        trace: {
          type: 'string',
          description: 'The agent trace/conversation to extract entities and relationships from',
        },
        domain: {
          type: 'string',
          description: 'Domain hint for better extraction (e.g., "customer-support", "engineering")',
        },
        mode: {
          type: 'string',
          enum: ['api-key', 'endpoint', 'xache-managed'],
          description: 'LLM mode (default: auto-detected from env vars)',
        },
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google', 'mistral', 'groq', 'together', 'fireworks', 'cohere', 'xai', 'deepseek'],
          description: 'LLM provider for api-key mode (default: anthropic)',
        },
        model: {
          type: 'string',
          description: 'Specific model to use (optional)',
        },
        confidenceThreshold: {
          type: 'number',
          description: 'Minimum confidence for extraction (0.0-1.0, default: 0.7)',
        },
        maxEntities: {
          type: 'number',
          description: 'Maximum entities to extract (default: provider limit)',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['trace'],
    },
  },
  {
    name: 'xache_graph_load',
    description:
      'Load the full knowledge graph. Returns all entities and relationships. Optionally filter by entity type or load a historical snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        entityTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific entity types (e.g., ["person", "organization"])',
        },
        validAt: {
          type: 'string',
          description: 'Load graph as it existed at this time (ISO8601 date string)',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'xache_graph_query',
    description:
      'Query a subgraph around a specific entity. Returns the entity and all connected entities/relationships within the specified depth.',
    inputSchema: {
      type: 'object',
      properties: {
        startEntity: {
          type: 'string',
          description: 'Name of the starting entity (e.g., "John Smith", "Acme Corp")',
        },
        depth: {
          type: 'number',
          description: 'Number of hops from start entity (default: 2)',
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific relationship types (e.g., ["works_at", "manages"])',
        },
        validAt: {
          type: 'string',
          description: 'Query as of this point in time (ISO8601)',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['startEntity'],
    },
  },
  {
    name: 'xache_graph_ask',
    description:
      'Ask a natural language question about the knowledge graph. Uses LLM to analyze the graph and generate an answer with source citations.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question (e.g., "Who manages the engineering team?")',
        },
        mode: {
          type: 'string',
          enum: ['api-key', 'endpoint', 'xache-managed'],
          description: 'LLM mode (default: auto-detected from env vars)',
        },
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google', 'mistral', 'groq', 'together', 'fireworks', 'cohere', 'xai', 'deepseek'],
          description: 'LLM provider for api-key mode (default: anthropic)',
        },
        model: {
          type: 'string',
          description: 'Specific model to use (optional)',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'xache_graph_add_entity',
    description:
      'Manually add an entity to the knowledge graph. Use when you want to explicitly create a person, organization, tool, concept, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Entity display name (e.g., "John Smith", "React")',
        },
        type: {
          type: 'string',
          description: 'Entity type: "person", "organization", "tool", "concept", "location", "event", "product", "project", or custom',
        },
        summary: {
          type: 'string',
          description: 'Brief description of the entity',
        },
        attributes: {
          type: 'object',
          description: 'Arbitrary key-value attributes',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'xache_graph_add_relationship',
    description:
      'Create a relationship between two entities in the knowledge graph. Both entities must already exist.',
    inputSchema: {
      type: 'object',
      properties: {
        fromEntity: {
          type: 'string',
          description: 'Source entity name',
        },
        toEntity: {
          type: 'string',
          description: 'Target entity name',
        },
        type: {
          type: 'string',
          description: 'Relationship type: "works_at", "knows", "uses", "manages", "reports_to", "part_of", "created", "owns", "located_in", "related_to", or custom',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of the relationship',
        },
        attributes: {
          type: 'object',
          description: 'Arbitrary key-value attributes',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['fromEntity', 'toEntity', 'type'],
    },
  },
  {
    name: 'xache_graph_merge_entities',
    description:
      'Merge two entities into one. The source entity is superseded and the target entity is updated with merged attributes. Relationships are transferred.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceName: {
          type: 'string',
          description: 'Entity to merge FROM (will be superseded)',
        },
        targetName: {
          type: 'string',
          description: 'Entity to merge INTO (will be updated)',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['sourceName', 'targetName'],
    },
  },
  {
    name: 'xache_graph_entity_history',
    description:
      'Get the full version history of an entity. Shows how the entity has changed over time, including all temporal versions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Entity name to look up history for',
        },
        subject: {
          type: 'object',
          description: 'Subject context for graph scoping',
          properties: {
            scope: { type: 'string', enum: ['SUBJECT', 'SEGMENT', 'GLOBAL'] },
            subjectId: { type: 'string' },
            segmentId: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
      required: ['name'],
    },
  },

  // =========================================================================
  // Ephemeral Context Tools
  // =========================================================================
  {
    name: 'xache_ephemeral_create_session',
    description:
      'Create a new ephemeral working memory session. Returns a session key for storing temporary data in slots (conversation, facts, tasks, cache, scratch, handoff). Sessions auto-expire after TTL.',
    inputSchema: {
      type: 'object',
      properties: {
        ttlSeconds: {
          type: 'number',
          description: 'Session time-to-live in seconds (default: 3600)',
        },
        maxWindows: {
          type: 'number',
          description: 'Maximum renewal windows (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'xache_ephemeral_write_slot',
    description:
      'Write data to an ephemeral session slot. Use slots to organize working memory: conversation (dialog history), facts (extracted facts), tasks (current tasks), cache (temporary data), scratch (working notes), handoff (data for next agent).',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: {
          type: 'string',
          description: 'The ephemeral session key',
        },
        slot: {
          type: 'string',
          enum: ['conversation', 'facts', 'tasks', 'cache', 'scratch', 'handoff'],
          description: 'Slot name',
        },
        data: {
          type: 'object',
          description: 'Data to write to the slot',
        },
      },
      required: ['sessionKey', 'slot', 'data'],
    },
  },
  {
    name: 'xache_ephemeral_read_slot',
    description:
      'Read data from an ephemeral session slot.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: {
          type: 'string',
          description: 'The ephemeral session key',
        },
        slot: {
          type: 'string',
          enum: ['conversation', 'facts', 'tasks', 'cache', 'scratch', 'handoff'],
          description: 'Slot name',
        },
      },
      required: ['sessionKey', 'slot'],
    },
  },
  {
    name: 'xache_ephemeral_promote',
    description:
      'Promote an ephemeral session to persistent memory. Extracts valuable data from all slots and stores as permanent memories with cryptographic receipts.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: {
          type: 'string',
          description: 'The ephemeral session key to promote',
        },
      },
      required: ['sessionKey'],
    },
  },
  {
    name: 'xache_ephemeral_status',
    description:
      'Get the status and details of an ephemeral session. Shows active slots, total size, TTL, window count, and cumulative cost.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: {
          type: 'string',
          description: 'The ephemeral session key',
        },
      },
      required: ['sessionKey'],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleCollectiveContribute(
  client: XacheClient,
  args: {
    pattern: string;
    domain: string;
    tags: string[];
    successRate?: number;
  }
): Promise<string> {
  const patternHash = hashPattern(args.pattern);
  const successRate = args.successRate ?? 0.8;

  const result = await client.collective.contribute({
    pattern: args.pattern,
    patternHash,
    domain: args.domain,
    tags: args.tags,
    metrics: {
      successRate,
      sampleSize: 1,
      confidence: successRate,
    },
    encryptedContentRef: patternHash, // Use hash as reference
  });

  return `Contributed insight to '${args.domain}'.\nHeuristic ID: ${result.heuristicId}`;
}

async function handleCollectiveQuery(
  client: XacheClient,
  args: { queryText: string; domain?: string; limit?: number }
): Promise<string> {
  const result = await client.collective.query({
    queryText: args.queryText,
    domain: args.domain,
    limit: args.limit || 5,
  });

  const matches = result.matches || [];
  if (matches.length === 0) {
    return 'No relevant insights found in the collective.';
  }

  let output = `Found ${matches.length} insights:\n`;
  for (let i = 0; i < matches.length; i++) {
    const item = matches[i];
    const pattern = (item.pattern || '').substring(0, 200);
    output += `\n${i + 1}. ${pattern}`;
    if (item.domain) {
      output += ` [Domain: ${item.domain}]`;
    }
    if (item.relevanceScore) {
      output += ` (relevance: ${(item.relevanceScore * 100).toFixed(0)}%)`;
    }
  }

  return output;
}

async function handleCollectiveList(
  client: XacheClient,
  args: { domain?: string; limit?: number }
): Promise<string> {
  const result = await client.collective.listHeuristics({
    domain: args.domain,
    limit: args.limit || 20,
  });

  const heuristics = result.heuristics || [];
  if (heuristics.length === 0) {
    return 'No heuristics found.';
  }

  let output = `Found ${heuristics.length} heuristics (total: ${result.total}):\n`;
  for (let i = 0; i < heuristics.length; i++) {
    const h = heuristics[i];
    output += `\n${i + 1}. [${h.domain}] ${h.description.substring(0, 100)}`;
    output += `\n   Tags: ${h.tags.join(', ')}`;
  }

  return output;
}

async function handleMemoryStore(
  client: XacheClient,
  args: {
    data: Record<string, unknown>;
    context?: string;
    tags?: string[];
    tier?: 'hot' | 'warm' | 'cold';
  }
): Promise<string> {
  const result = await client.memory.store({
    data: args.data,
    storageTier: args.tier || 'warm',
    context: args.context,
    tags: args.tags,
  });

  return `Stored memory.\nStorage Key: ${result.storageKey}\nReceipt ID: ${result.receiptId}\nTier: ${result.storageTier}`;
}

async function handleMemoryRetrieve(
  client: XacheClient,
  args: { storageKey: string }
): Promise<string> {
  const result = await client.memory.retrieve({
    storageKey: args.storageKey,
  });

  return `Retrieved memory.\nStorage Key: ${result.storageKey}\nTier: ${result.storageTier}\nData: ${JSON.stringify(result.data, null, 2)}`;
}

async function handleMemoryList(
  client: XacheClient,
  args: { context?: string; limit?: number }
): Promise<string> {
  const result = await client.memory.list({
    context: args.context,
    limit: args.limit || 20,
  });

  const memories = result.memories || [];
  if (memories.length === 0) {
    return 'No memories found.';
  }

  let output = `Found ${memories.length} memories (total: ${result.total}):\n`;
  for (let i = 0; i < memories.length; i++) {
    const m = memories[i];
    output += `\n${i + 1}. ${m.storage_key}`;
    if (m.context) output += ` [${m.context}]`;
    output += ` (${m.storage_tier})`;
  }

  return output;
}

async function handleCheckReputation(client: XacheClient): Promise<string> {
  const result = await client.reputation.getReputation();

  let level = 'New';
  const score = result.overall || 0;
  if (score >= 0.9) level = 'Elite';
  else if (score >= 0.7) level = 'Trusted';
  else if (score >= 0.5) level = 'Established';
  else if (score >= 0.3) level = 'Developing';

  let output = `Reputation Score: ${score.toFixed(2)}/1.00 (${level})\n`;
  output += `Memory Quality: ${(result.memoryQuality || 0).toFixed(2)}\n`;
  output += `Contribution Success: ${(result.contribSuccess || 0).toFixed(2)}\n`;
  output += `Economic Value: ${(result.economicValue || 0).toFixed(2)}`;

  return output;
}

async function handleLeaderboard(
  client: XacheClient,
  args: { limit?: number }
): Promise<string> {
  const topAgents = await client.reputation.getTopAgents(args.limit || 10);

  if (topAgents.length === 0) {
    return 'No agents on leaderboard yet.';
  }

  let output = `Top ${topAgents.length} Agents:\n`;
  for (let i = 0; i < topAgents.length; i++) {
    const agent = topAgents[i];
    output += `\n${i + 1}. ${agent.agentDID.substring(0, 30)}...`;
    output += `\n   Score: ${agent.reputationScore.toFixed(2)}`;
    output += ` | Operations: ${agent.operationCount}`;
    output += ` | Earned: $${parseFloat(agent.totalEarnedUSD).toFixed(2)}`;
  }

  return output;
}

async function handleExtractMemories(
  client: XacheClient,
  args: {
    trace: string;
    mode?: 'api-key' | 'endpoint' | 'xache-managed';
    provider?: LLMProvider;
    model?: string;
    contextHint?: string;
    confidenceThreshold?: number;
    autoStore?: boolean;
  }
): Promise<string> {
  // Determine mode based on config and args
  // Priority: explicit mode arg > endpoint config > api-key config > xache-managed
  let mode = args.mode;
  if (!mode) {
    if (config.llmEndpoint) {
      mode = 'endpoint';
    } else if (config.llmApiKey && config.llmProvider) {
      mode = 'api-key';
    } else {
      mode = 'xache-managed';
    }
  }

  const provider = args.provider || config.llmProvider || 'anthropic';
  const model = args.model || config.llmModel || undefined;

  // Build LLM config based on mode (properly typed for discriminated union)
  let llmConfig;
  let modeDescription: string;

  if (mode === 'api-key') {
    if (!config.llmApiKey) {
      throw new Error('api-key mode requires XACHE_LLM_API_KEY environment variable. Set it or use mode="xache-managed".');
    }
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }
    llmConfig = {
      type: 'api-key' as const,
      provider,
      apiKey: config.llmApiKey,
      model,
    };
    modeDescription = `api-key (${provider})`;
  } else if (mode === 'endpoint') {
    if (!config.llmEndpoint) {
      throw new Error('endpoint mode requires XACHE_LLM_ENDPOINT environment variable.');
    }
    llmConfig = {
      type: 'endpoint' as const,
      url: config.llmEndpoint,
      authToken: config.llmAuthToken || undefined,
      format: config.llmFormat,
      model,
    };
    modeDescription = `endpoint (${config.llmEndpoint.substring(0, 40)}...)`;
  } else {
    llmConfig = {
      type: 'xache-managed' as const,
      provider: provider === 'anthropic' || provider === 'openai' ? provider : 'anthropic',
      model,
    };
    modeDescription = `xache-managed (${provider})`;
  }

  const result = await client.extraction.extract({
    trace: args.trace,
    llmConfig,
    options: {
      contextHint: args.contextHint,
      confidenceThreshold: args.confidenceThreshold ?? 0.7,
      autoStore: args.autoStore ?? true,
    },
  });

  const extractions = result.extractions || [];
  if (extractions.length === 0) {
    return 'No memories extracted from trace.';
  }

  let output = `Extracted ${extractions.length} memories:\n`;
  output += `Mode: ${modeDescription}\n`;

  for (let i = 0; i < extractions.length; i++) {
    const mem = extractions[i];
    const dataStr = JSON.stringify(mem.data).substring(0, 150);
    output += `\n${i + 1}. [${mem.type}] ${dataStr}`;
    output += `\n   Confidence: ${((mem.confidence || 0) * 100).toFixed(0)}%`;
    if (mem.reasoning) output += ` | ${mem.reasoning.substring(0, 50)}`;
  }

  if (result.stored && result.stored.length > 0) {
    output += `\n\nAuto-stored ${result.stored.length} memories.`;
  }

  return output;
}

async function handleExtractAndContribute(
  client: XacheClient,
  args: {
    trace: string;
    domain: string;
    mode?: 'api-key' | 'endpoint' | 'xache-managed';
    provider?: LLMProvider;
    contributionThreshold?: number;
  }
): Promise<string> {
  // Determine mode based on config and args
  let mode = args.mode;
  if (!mode) {
    if (config.llmEndpoint) {
      mode = 'endpoint';
    } else if (config.llmApiKey && config.llmProvider) {
      mode = 'api-key';
    } else {
      mode = 'xache-managed';
    }
  }

  const provider = args.provider || config.llmProvider || 'anthropic';
  const model = config.llmModel || undefined;

  // Build LLM config based on mode
  let llmConfig;

  if (mode === 'api-key') {
    if (!config.llmApiKey) {
      throw new Error('api-key mode requires XACHE_LLM_API_KEY environment variable.');
    }
    llmConfig = {
      type: 'api-key' as const,
      provider,
      apiKey: config.llmApiKey,
      model,
    };
  } else if (mode === 'endpoint') {
    if (!config.llmEndpoint) {
      throw new Error('endpoint mode requires XACHE_LLM_ENDPOINT environment variable.');
    }
    llmConfig = {
      type: 'endpoint' as const,
      url: config.llmEndpoint,
      authToken: config.llmAuthToken || undefined,
      format: config.llmFormat,
      model,
    };
  } else {
    llmConfig = {
      type: 'xache-managed' as const,
      provider: provider === 'anthropic' || provider === 'openai' ? provider : 'anthropic',
      model,
    };
  }

  const threshold = args.contributionThreshold ?? 0.85;

  const result = await client.extraction.extract({
    trace: args.trace,
    llmConfig,
    options: {
      confidenceThreshold: 0.7,
      autoStore: true,
    },
  });

  const extractions = result.extractions || [];
  let output = `Extracted ${extractions.length} memories.\n`;

  // Find high-quality heuristics to contribute
  const heuristicTypes = ['DOMAIN_HEURISTIC', 'SUCCESSFUL_PATTERN', 'ERROR_FIX'];
  const contributions: string[] = [];

  for (const mem of extractions) {
    if (
      heuristicTypes.includes(mem.type) &&
      (mem.confidence || 0) >= threshold
    ) {
      try {
        // Use reasoning as the pattern content
        const patternContent = mem.reasoning || JSON.stringify(mem.data);
        const patternHash = hashPattern(patternContent);
        const contribResult = await client.collective.contribute({
          pattern: patternContent,
          patternHash,
          domain: args.domain,
          tags: [mem.type.toLowerCase().replace('_', '-'), args.domain],
          metrics: {
            successRate: mem.confidence || 0.85,
            sampleSize: 1,
            confidence: mem.confidence || 0.85,
          },
          encryptedContentRef: patternHash,
        });
        contributions.push(
          `${patternContent.substring(0, 50)}... → ${contribResult.heuristicId}`
        );
      } catch (e) {
        // Skip contribution errors, continue with others
      }
    }
  }

  if (contributions.length > 0) {
    output += `\nContributed ${contributions.length} heuristics to collective:\n`;
    for (const c of contributions) {
      output += `  • ${c}\n`;
    }
    output += `\nThese contributions earn reputation!`;
  } else {
    output += `\nNo heuristics met the contribution threshold (${(threshold * 100).toFixed(0)}%).`;
  }

  return output;
}

// =============================================================================
// Graph Tool Handlers
// =============================================================================

/**
 * Build LLM config from args + env vars (shared by graph extract/ask and extraction tools)
 */
function buildLLMConfig(args: {
  mode?: 'api-key' | 'endpoint' | 'xache-managed';
  provider?: LLMProvider;
  model?: string;
}): { llmConfig: Record<string, unknown>; modeDescription: string } {
  let mode = args.mode;
  if (!mode) {
    if (config.llmEndpoint) mode = 'endpoint';
    else if (config.llmApiKey && config.llmProvider) mode = 'api-key';
    else mode = 'xache-managed';
  }

  const provider = args.provider || config.llmProvider || 'anthropic';
  const model = args.model || config.llmModel || undefined;

  if (mode === 'api-key') {
    if (!config.llmApiKey) {
      throw new Error('api-key mode requires XACHE_LLM_API_KEY environment variable.');
    }
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }
    return {
      llmConfig: { type: 'api-key' as const, provider, apiKey: config.llmApiKey, model },
      modeDescription: `api-key (${provider})`,
    };
  } else if (mode === 'endpoint') {
    if (!config.llmEndpoint) {
      throw new Error('endpoint mode requires XACHE_LLM_ENDPOINT environment variable.');
    }
    return {
      llmConfig: {
        type: 'endpoint' as const,
        url: config.llmEndpoint,
        authToken: config.llmAuthToken || undefined,
        format: config.llmFormat,
        model,
      },
      modeDescription: `endpoint (${config.llmEndpoint.substring(0, 40)}...)`,
    };
  } else {
    return {
      llmConfig: {
        type: 'xache-managed' as const,
        provider: provider === 'anthropic' || provider === 'openai' ? provider : 'anthropic',
        model,
      },
      modeDescription: `xache-managed (${provider})`,
    };
  }
}

async function handleGraphExtract(
  client: XacheClient,
  args: {
    trace: string;
    domain?: string;
    mode?: 'api-key' | 'endpoint' | 'xache-managed';
    provider?: LLMProvider;
    model?: string;
    confidenceThreshold?: number;
    maxEntities?: number;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const { llmConfig, modeDescription } = buildLLMConfig(args);
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const result = await client.graph.extract({
    trace: args.trace,
    llmConfig: llmConfig as any,
    subject,
    options: {
      contextHint: args.domain,
      confidenceThreshold: args.confidenceThreshold ?? 0.7,
      maxEntities: args.maxEntities,
    },
  });

  const entities = result.entities || [];
  const relationships = result.relationships || [];

  if (entities.length === 0 && relationships.length === 0) {
    return 'No entities or relationships extracted from trace.';
  }

  let output = `Extracted ${entities.length} entities and ${relationships.length} relationships.\n`;
  output += `Mode: ${modeDescription}\n`;

  if (entities.length > 0) {
    output += '\nEntities:\n';
    for (const e of entities) {
      output += `  • ${e.name} [${e.type}]${e.isNew ? ' (new)' : ''}${e.updated ? ' (updated)' : ''}\n`;
    }
  }

  if (relationships.length > 0) {
    output += '\nRelationships:\n';
    for (const r of relationships) {
      output += `  • ${r.from} → ${r.type} → ${r.to}${r.isNew ? ' (new)' : ''}\n`;
    }
  }

  if (result.temporalUpdates && result.temporalUpdates.length > 0) {
    output += `\n${result.temporalUpdates.length} temporal update(s) detected.`;
  }

  output += `\nStored: ${result.stored} items`;
  return output;
}

async function handleGraphLoad(
  client: XacheClient,
  args: {
    entityTypes?: string[];
    validAt?: string;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const graph = await client.graph.load({
    subject,
    entityTypes: args.entityTypes,
    validAt: args.validAt,
  });

  const data = graph.toJSON();
  const entities = data.entities || [];
  const relationships = data.relationships || [];

  if (entities.length === 0) {
    return 'Knowledge graph is empty.';
  }

  let output = `Knowledge graph: ${entities.length} entities, ${relationships.length} relationships\n`;

  output += '\nEntities:\n';
  for (const e of entities) {
    output += `  • ${e.name} [${e.type}]`;
    if (e.summary) output += ` — ${e.summary.substring(0, 80)}`;
    output += '\n';
  }

  if (relationships.length > 0) {
    output += '\nRelationships:\n';
    for (const r of relationships) {
      output += `  • ${r.fromKey.substring(0, 8)}... → ${r.type} → ${r.toKey.substring(0, 8)}...`;
      if (r.description) output += ` (${r.description.substring(0, 60)})`;
      output += '\n';
    }
  }

  return output;
}

async function handleGraphQuery(
  client: XacheClient,
  args: {
    startEntity: string;
    depth?: number;
    relationshipTypes?: string[];
    validAt?: string;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const graph = await client.graph.query({
    subject,
    startEntity: args.startEntity,
    depth: args.depth ?? 2,
    relationshipTypes: args.relationshipTypes,
    validAt: args.validAt,
  });

  const data = graph.toJSON();
  const entities = data.entities || [];
  const relationships = data.relationships || [];

  if (entities.length === 0) {
    return `No entities found connected to "${args.startEntity}".`;
  }

  let output = `Subgraph around "${args.startEntity}": ${entities.length} entities, ${relationships.length} relationships\n`;

  output += '\nEntities:\n';
  for (const e of entities) {
    output += `  • ${e.name} [${e.type}]`;
    if (e.summary) output += ` — ${e.summary.substring(0, 80)}`;
    output += '\n';
  }

  if (relationships.length > 0) {
    output += '\nRelationships:\n';
    for (const r of relationships) {
      output += `  • ${r.fromKey.substring(0, 8)}... → ${r.type} → ${r.toKey.substring(0, 8)}...`;
      if (r.description) output += ` (${r.description.substring(0, 60)})`;
      output += '\n';
    }
  }

  return output;
}

async function handleGraphAsk(
  client: XacheClient,
  args: {
    question: string;
    mode?: 'api-key' | 'endpoint' | 'xache-managed';
    provider?: LLMProvider;
    model?: string;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const { llmConfig, modeDescription } = buildLLMConfig(args);
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const answer = await client.graph.ask({
    subject,
    question: args.question,
    llmConfig: llmConfig as any,
  });

  let output = `Answer: ${answer.answer}\n`;
  output += `Confidence: ${(answer.confidence * 100).toFixed(0)}%\n`;
  output += `Mode: ${modeDescription}\n`;

  if (answer.sources && answer.sources.length > 0) {
    output += '\nSources:\n';
    for (const s of answer.sources) {
      output += `  • ${s.name} [${s.type}]\n`;
    }
  }

  return output;
}

async function handleGraphAddEntity(
  client: XacheClient,
  args: {
    name: string;
    type: string;
    summary?: string;
    attributes?: Record<string, unknown>;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const entity = await client.graph.addEntity({
    subject,
    name: args.name,
    type: args.type,
    summary: args.summary,
    attributes: args.attributes,
  });

  return `Created entity "${entity.name}" [${entity.type}]\nKey: ${entity.key}\nStorage Key: ${entity.storageKey}`;
}

async function handleGraphAddRelationship(
  client: XacheClient,
  args: {
    fromEntity: string;
    toEntity: string;
    type: string;
    description?: string;
    attributes?: Record<string, unknown>;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const rel = await client.graph.addRelationship({
    subject,
    from: args.fromEntity,
    to: args.toEntity,
    type: args.type,
    description: args.description,
    attributes: args.attributes,
  });

  return `Created relationship: ${args.fromEntity} → ${rel.type} → ${args.toEntity}\nStorage Key: ${rel.storageKey}`;
}

async function handleGraphMergeEntities(
  client: XacheClient,
  args: {
    sourceName: string;
    targetName: string;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const merged = await client.graph.mergeEntities({
    subject,
    sourceName: args.sourceName,
    targetName: args.targetName,
  });

  return `Merged "${args.sourceName}" into "${args.targetName}".\nResult: ${merged.name} [${merged.type}] (v${merged.version})\nKey: ${merged.key}`;
}

async function handleGraphEntityHistory(
  client: XacheClient,
  args: {
    name: string;
    subject?: Record<string, unknown>;
  }
): Promise<string> {
  const subject = buildSubjectContext(args as Record<string, unknown>);

  const versions = await client.graph.getEntityHistory({
    subject,
    name: args.name,
  });

  if (versions.length === 0) {
    return `No history found for entity "${args.name}".`;
  }

  let output = `History for "${args.name}": ${versions.length} version(s)\n`;

  for (const v of versions) {
    output += `\n  v${v.version} — ${v.name} [${v.type}]`;
    if (v.summary) output += `\n    Summary: ${v.summary.substring(0, 100)}`;
    output += `\n    Valid: ${v.validFrom}${v.validTo ? ` → ${v.validTo}` : ' → current'}`;
  }

  return output;
}

// =============================================================================
// Ephemeral Context Handlers
// =============================================================================

async function handleEphemeralCreateSession(
  client: XacheClient,
  args: { ttlSeconds?: number; maxWindows?: number }
): Promise<string> {
  const session = await client.ephemeral.createSession({
    ttlSeconds: args.ttlSeconds,
    maxWindows: args.maxWindows,
  });

  return [
    `Created ephemeral session.`,
    `Session Key: ${session.sessionKey}`,
    `Status: ${session.status}`,
    `TTL: ${session.ttlSeconds}s`,
    `Window: ${session.window}/${session.maxWindows}`,
    `Expires: ${session.expiresAt}`,
  ].join('\n');
}

async function handleEphemeralWriteSlot(
  client: XacheClient,
  args: { sessionKey: string; slot: string; data: Record<string, unknown> }
): Promise<string> {
  await client.ephemeral.writeSlot(args.sessionKey, args.slot as any, args.data);
  return `Wrote data to slot "${args.slot}" in session ${args.sessionKey.substring(0, 12)}...`;
}

async function handleEphemeralReadSlot(
  client: XacheClient,
  args: { sessionKey: string; slot: string }
): Promise<string> {
  const data = await client.ephemeral.readSlot(args.sessionKey, args.slot as any);
  return `Slot "${args.slot}" data:\n${JSON.stringify(data, null, 2)}`;
}

async function handleEphemeralPromote(
  client: XacheClient,
  args: { sessionKey: string }
): Promise<string> {
  const result = await client.ephemeral.promoteSession(args.sessionKey);

  let output = `Promoted session ${args.sessionKey.substring(0, 12)}...\n`;
  output += `Memories created: ${result.memoriesCreated}\n`;
  if (result.memoryIds.length > 0) {
    output += `Memory IDs: ${result.memoryIds.join(', ')}\n`;
  }
  if (result.receiptId) {
    output += `Receipt: ${result.receiptId}`;
  }
  return output;
}

async function handleEphemeralStatus(
  client: XacheClient,
  args: { sessionKey: string }
): Promise<string> {
  const session = await client.ephemeral.getSession(args.sessionKey);

  if (!session) {
    return `Session ${args.sessionKey.substring(0, 12)}... not found.`;
  }

  return [
    `Session: ${session.sessionKey.substring(0, 12)}...`,
    `Status: ${session.status}`,
    `Window: ${session.window}/${session.maxWindows}`,
    `TTL: ${session.ttlSeconds}s`,
    `Expires: ${session.expiresAt}`,
    `Active Slots: ${session.activeSlots.length > 0 ? session.activeSlots.join(', ') : 'none'}`,
    `Total Size: ${session.totalSize} bytes`,
    `Cumulative Cost: $${session.cumulativeCost.toFixed(4)}`,
  ].join('\n');
}

// =============================================================================
// Server Setup
// =============================================================================

async function main(): Promise<void> {
  validateConfig();

  const server = new Server(
    {
      name: 'xache-mcp-server',
      version: '0.3.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create Xache client
  const client = new XacheClient({
    apiUrl: config.apiUrl,
    did: getDID(),
    privateKey: config.privateKey,
    encryptionKey: config.encryptionKey || undefined,
  });

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'xache_collective_contribute':
          result = await handleCollectiveContribute(client, args as any);
          break;
        case 'xache_collective_query':
          result = await handleCollectiveQuery(client, args as any);
          break;
        case 'xache_collective_list':
          result = await handleCollectiveList(client, args as any);
          break;
        case 'xache_memory_store':
          result = await handleMemoryStore(client, args as any);
          break;
        case 'xache_memory_retrieve':
          result = await handleMemoryRetrieve(client, args as any);
          break;
        case 'xache_memory_list':
          result = await handleMemoryList(client, args as any);
          break;
        case 'xache_check_reputation':
          result = await handleCheckReputation(client);
          break;
        case 'xache_leaderboard':
          result = await handleLeaderboard(client, args as any);
          break;
        case 'xache_extract_memories':
          result = await handleExtractMemories(client, args as any);
          break;
        case 'xache_extract_and_contribute':
          result = await handleExtractAndContribute(client, args as any);
          break;
        case 'xache_graph_extract':
          result = await handleGraphExtract(client, args as any);
          break;
        case 'xache_graph_load':
          result = await handleGraphLoad(client, args as any);
          break;
        case 'xache_graph_query':
          result = await handleGraphQuery(client, args as any);
          break;
        case 'xache_graph_ask':
          result = await handleGraphAsk(client, args as any);
          break;
        case 'xache_graph_add_entity':
          result = await handleGraphAddEntity(client, args as any);
          break;
        case 'xache_graph_add_relationship':
          result = await handleGraphAddRelationship(client, args as any);
          break;
        case 'xache_graph_merge_entities':
          result = await handleGraphMergeEntities(client, args as any);
          break;
        case 'xache_graph_entity_history':
          result = await handleGraphEntityHistory(client, args as any);
          break;
        case 'xache_ephemeral_create_session':
          result = await handleEphemeralCreateSession(client, args as any);
          break;
        case 'xache_ephemeral_write_slot':
          result = await handleEphemeralWriteSlot(client, args as any);
          break;
        case 'xache_ephemeral_read_slot':
          result = await handleEphemeralReadSlot(client, args as any);
          break;
        case 'xache_ephemeral_promote':
          result = await handleEphemeralPromote(client, args as any);
          break;
        case 'xache_ephemeral_status':
          result = await handleEphemeralStatus(client, args as any);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Xache MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
