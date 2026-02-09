/**
 * Xache Ephemeral Context for LangChain.js
 * Create, manage, and promote short-lived working memory sessions
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  XacheClient,
  DID,
  type XacheSigner,
  type XacheWalletProvider,
} from '@xache/sdk';

// =============================================================================
// Configuration
// =============================================================================

export interface EphemeralToolConfig {
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

function createClient(config: EphemeralToolConfig): XacheClient {
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

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tool for creating an ephemeral working memory session.
 */
export function createEphemeralCreateSessionTool(
  config: EphemeralToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_ephemeral_create_session',
    description:
      'Create a new ephemeral working memory session. ' +
      'Returns a session key for storing temporary data in slots.',
    schema: z.object({
      ttlSeconds: z.number().optional().describe('Session time-to-live in seconds (default: 3600)'),
      maxWindows: z.number().optional().describe('Maximum renewal windows (default: 5)'),
    }),
    func: async ({ ttlSeconds, maxWindows }) => {
      const session = await client.ephemeral.createSession({
        ttlSeconds,
        maxWindows,
      });

      return [
        `Created ephemeral session.`,
        `Session Key: ${session.sessionKey}`,
        `Status: ${session.status}`,
        `TTL: ${session.ttlSeconds}s`,
        `Expires: ${session.expiresAt}`,
      ].join('\n');
    },
  });
}

/**
 * Create a tool for writing data to an ephemeral slot.
 */
export function createEphemeralWriteSlotTool(
  config: EphemeralToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_ephemeral_write_slot',
    description:
      'Write data to an ephemeral session slot. ' +
      'Slots: conversation, facts, tasks, cache, scratch, handoff.',
    schema: z.object({
      sessionKey: z.string().describe('The ephemeral session key'),
      slot: z.enum(['conversation', 'facts', 'tasks', 'cache', 'scratch', 'handoff']).describe('Slot name'),
      data: z.record(z.string(), z.unknown()).describe('Data to write to the slot'),
    }),
    func: async ({ sessionKey, slot, data }) => {
      await client.ephemeral.writeSlot(sessionKey, slot as any, data as Record<string, unknown>);
      return `Wrote data to slot "${slot}" in session ${sessionKey.substring(0, 12)}...`;
    },
  });
}

/**
 * Create a tool for reading data from an ephemeral slot.
 */
export function createEphemeralReadSlotTool(
  config: EphemeralToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_ephemeral_read_slot',
    description:
      'Read data from an ephemeral session slot. ' +
      'Slots: conversation, facts, tasks, cache, scratch, handoff.',
    schema: z.object({
      sessionKey: z.string().describe('The ephemeral session key'),
      slot: z.enum(['conversation', 'facts', 'tasks', 'cache', 'scratch', 'handoff']).describe('Slot name'),
    }),
    func: async ({ sessionKey, slot }) => {
      const data = await client.ephemeral.readSlot(sessionKey, slot as any);
      return JSON.stringify(data, null, 2);
    },
  });
}

/**
 * Create a tool for promoting an ephemeral session to persistent memory.
 */
export function createEphemeralPromoteTool(
  config: EphemeralToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_ephemeral_promote',
    description:
      'Promote an ephemeral session to persistent memory. ' +
      'Extracts valuable data from slots and stores as permanent memories.',
    schema: z.object({
      sessionKey: z.string().describe('The ephemeral session key to promote'),
    }),
    func: async ({ sessionKey }) => {
      const result = await client.ephemeral.promoteSession(sessionKey);

      let output = `Promoted session ${sessionKey.substring(0, 12)}...\n`;
      output += `Memories created: ${result.memoriesCreated}\n`;
      if (result.memoryIds.length > 0) {
        output += `Memory IDs: ${result.memoryIds.join(', ')}\n`;
      }
      if (result.receiptId) {
        output += `Receipt: ${result.receiptId}`;
      }
      return output;
    },
  });
}

/**
 * Create a tool for getting ephemeral session status and details.
 */
export function createEphemeralStatusTool(
  config: EphemeralToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_ephemeral_status',
    description:
      'Get the status and details of an ephemeral session. ' +
      'Shows active slots, size, TTL, and window information.',
    schema: z.object({
      sessionKey: z.string().describe('The ephemeral session key'),
    }),
    func: async ({ sessionKey }) => {
      const session = await client.ephemeral.getSession(sessionKey);

      if (!session) {
        return `Session ${sessionKey.substring(0, 12)}... not found.`;
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
    },
  });
}

// =============================================================================
// Class Wrappers
// =============================================================================

export class XacheEphemeralCreateSessionTool {
  private tool: DynamicStructuredTool;

  constructor(config: EphemeralToolConfig) {
    this.tool = createEphemeralCreateSessionTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

export class XacheEphemeralWriteSlotTool {
  private tool: DynamicStructuredTool;

  constructor(config: EphemeralToolConfig) {
    this.tool = createEphemeralWriteSlotTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

export class XacheEphemeralReadSlotTool {
  private tool: DynamicStructuredTool;

  constructor(config: EphemeralToolConfig) {
    this.tool = createEphemeralReadSlotTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

export class XacheEphemeralPromoteTool {
  private tool: DynamicStructuredTool;

  constructor(config: EphemeralToolConfig) {
    this.tool = createEphemeralPromoteTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

export class XacheEphemeralStatusTool {
  private tool: DynamicStructuredTool;

  constructor(config: EphemeralToolConfig) {
    this.tool = createEphemeralStatusTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}
