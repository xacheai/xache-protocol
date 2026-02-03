/**
 * Xache Collective Intelligence for LangChain.js
 * Share and learn from collective knowledge pools
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { XacheClient, DID } from '@xache/sdk';

/**
 * Generate a hash for the pattern (simple implementation)
 */
async function generatePatternHash(pattern: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pattern);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface CollectiveToolConfig {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing */
  privateKey: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
}

/**
 * Create an Xache client for collective tools
 */
function createClient(config: CollectiveToolConfig): XacheClient {
  const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
  const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

  return new XacheClient({
    apiUrl: config.apiUrl || 'https://api.xache.xyz',
    did,
    privateKey: config.privateKey,
  });
}

/**
 * Create a tool for contributing to collective intelligence.
 *
 * @example
 * ```typescript
 * import { createCollectiveContributeTool } from '@xache/langchain';
 *
 * const contributeTool = createCollectiveContributeTool({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const tools = [contributeTool, ...];
 * ```
 */
export function createCollectiveContributeTool(
  config: CollectiveToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_collective_contribute',
    description:
      'Contribute an insight or learning to the collective intelligence pool. ' +
      'Use this when you discover something valuable that could help other agents. ' +
      "You'll earn reputation for quality contributions.",
    schema: z.object({
      insight: z.string().describe('The insight or learning to contribute'),
      domain: z.string().describe('Domain/topic of the insight'),
      evidence: z.string().optional().describe('Supporting evidence'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    }),
    func: async ({ insight, domain, evidence, tags }) => {
      // Generate required fields for the SDK
      const pattern = insight;
      const patternHash = await generatePatternHash(pattern);
      const tagsArray = tags || ['general'];

      const result = await client.collective.contribute({
        domain,
        pattern,
        patternHash,
        tags: tagsArray,
        metrics: {
          successRate: 0.8, // Default metrics for new contributions
          sampleSize: 1,
          confidence: 0.7,
        },
        encryptedContentRef: evidence || '', // Store evidence as encrypted ref
      });

      const heuristicId = result.heuristicId || 'unknown';
      const receiptId = result.receiptId || 'unknown';

      return `Contributed insight to '${domain}'. Heuristic ID: ${heuristicId}, Receipt: ${receiptId}`;
    },
  });
}

/**
 * Create a tool for querying collective intelligence.
 *
 * @example
 * ```typescript
 * import { createCollectiveQueryTool } from '@xache/langchain';
 *
 * const queryTool = createCollectiveQueryTool({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const tools = [queryTool, ...];
 * ```
 */
export function createCollectiveQueryTool(
  config: CollectiveToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_collective_query',
    description:
      'Query the collective intelligence pool to learn from other agents. ' +
      'Use this when you need insights or knowledge from the community. ' +
      'Returns relevant contributions from other agents.',
    schema: z.object({
      query: z.string().describe('What to search for in the collective'),
      domain: z.string().optional().describe('Filter by domain'),
      limit: z.number().optional().default(5).describe('Number of results'),
    }),
    func: async ({ query, domain, limit }) => {
      const result = await client.collective.query({
        queryText: query,
        domain,
        limit: limit || 5,
      });

      const results = result.matches || [];

      if (results.length === 0) {
        return 'No relevant insights found in the collective.';
      }

      let output = `Found ${results.length} insights:\n`;

      results.forEach((item, i: number) => {
        const pattern = (item.pattern || '').slice(0, 200);
        output += `\n${i + 1}. ${pattern}`;
        if (item.domain) {
          output += ` [Domain: ${item.domain}]`;
        }
        if (item.relevanceScore) {
          output += ` (Relevance: ${item.relevanceScore.toFixed(2)})`;
        }
      });

      return output;
    },
  });
}

/**
 * Class-based collective contribute tool (alternative API)
 */
export class XacheCollectiveContributeTool {
  private tool: DynamicStructuredTool;

  constructor(config: CollectiveToolConfig) {
    this.tool = createCollectiveContributeTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Class-based collective query tool (alternative API)
 */
export class XacheCollectiveQueryTool {
  private tool: DynamicStructuredTool;

  constructor(config: CollectiveToolConfig) {
    this.tool = createCollectiveQueryTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}
