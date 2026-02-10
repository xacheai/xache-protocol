/**
 * Xache Memory Probe for LangChain.js
 * Zero-knowledge semantic memory search using cognitive fingerprints
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { XacheClient, DID, type XacheSigner, type XacheWalletProvider } from '@xache/sdk';

export interface ProbeToolConfig {
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
}

/**
 * Create an Xache client for probe tools
 */
function createClient(config: ProbeToolConfig): XacheClient {
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

const COGNITIVE_CATEGORIES = [
  'preference', 'fact', 'event', 'procedure', 'relationship',
  'observation', 'decision', 'goal', 'constraint', 'reference',
  'summary', 'handoff', 'pattern', 'feedback', 'unknown',
] as const;

/**
 * Create a tool for probing memory using cognitive fingerprints.
 *
 * @example
 * ```typescript
 * import { createMemoryProbeTool } from '@xache/langchain';
 *
 * const probeTool = createMemoryProbeTool({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const tools = [probeTool, ...];
 * ```
 */
export function createMemoryProbeTool(
  config: ProbeToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_memory_probe',
    description:
      'Search your memories by topic using zero-knowledge semantic matching. ' +
      'Use this when you want to check what you already know about a topic ' +
      'without knowing exact storage keys. Returns matching memories with decrypted data.',
    schema: z.object({
      query: z.string().describe('What to search for in your memories'),
      category: z.enum(COGNITIVE_CATEGORIES).optional().describe('Filter by cognitive category'),
      limit: z.number().optional().default(10).describe('Maximum number of results (1-50)'),
    }),
    func: async ({ query, category, limit }) => {
      const result = await client.memory.probe({
        query,
        category,
        limit: limit || 10,
      });

      const matches = result.matches || [];

      if (matches.length === 0) {
        return 'No matching memories found for this query.';
      }

      let output = `Found ${matches.length} matching memories (total: ${result.total}):\n`;

      matches.forEach((match, i: number) => {
        const data = typeof match.data === 'string'
          ? match.data.slice(0, 300)
          : JSON.stringify(match.data).slice(0, 300);
        output += `\n${i + 1}. [${match.category}] ${data}`;
        output += ` (key: ${match.storageKey})`;
      });

      return output;
    },
  });
}

/**
 * Class-based memory probe tool (alternative API)
 */
export class XacheMemoryProbeTool {
  private tool: DynamicStructuredTool;

  constructor(config: ProbeToolConfig) {
    this.tool = createMemoryProbeTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}
