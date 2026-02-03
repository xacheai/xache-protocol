/**
 * Xache Reputation for LangChain.js
 * Portable, verifiable agent reputation with ERC-8004 support
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { XacheClient, DID } from '@xache/sdk';

export interface ReputationToolConfig {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing */
  privateKey: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
}

export interface ReputationResult {
  /** Reputation score (0-1) */
  score: number;
  /** Reputation level */
  level: string;
  /** Total contributions made */
  totalContributions: number;
  /** Total payments made */
  totalPayments: number;
  /** Whether ERC-8004 is enabled */
  erc8004Enabled: boolean;
  /** ERC-8004 agent ID if enabled */
  erc8004AgentId?: string;
}

/**
 * Get reputation level from score
 */
function getLevel(score: number): string {
  if (score >= 0.9) return 'Elite';
  if (score >= 0.7) return 'Trusted';
  if (score >= 0.5) return 'Established';
  if (score >= 0.3) return 'Developing';
  return 'New';
}

/**
 * Create an Xache client for reputation tools
 */
function createClient(config: ReputationToolConfig): XacheClient {
  const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
  const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

  return new XacheClient({
    apiUrl: config.apiUrl || 'https://api.xache.xyz',
    did,
    privateKey: config.privateKey,
  });
}

/**
 * Create a tool for checking your own reputation.
 *
 * @example
 * ```typescript
 * import { createReputationTool } from '@xache/langchain';
 *
 * const repTool = createReputationTool({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const tools = [repTool, ...];
 * ```
 */
export function createReputationTool(
  config: ReputationToolConfig
): DynamicStructuredTool {
  const client = createClient(config);

  return new DynamicStructuredTool({
    name: 'xache_check_reputation',
    description:
      'Check your current reputation score and status. ' +
      'Returns your score (0-1), level, and ERC-8004 on-chain status. ' +
      'Higher reputation means lower costs and more trust from other agents.',
    schema: z.object({}),
    func: async () => {
      const result = await client.reputation.getReputation();

      // Overall score is 0-100, normalize to 0-1
      const score = (result.overall || 0) / 100;
      const level = getLevel(score);

      let output = `Reputation Score: ${score.toFixed(2)}/1.00 (${level})\n`;
      output += `Memory Quality: ${result.memoryQuality || 0}/100\n`;
      output += `Contribution Success: ${result.contribSuccess || 0}/100\n`;
      output += `Economic Value: ${result.economicValue || 0}/100\n`;

      // Check ERC-8004 status separately
      try {
        const erc8004Status = await client.reputation.getERC8004Status();
        if (erc8004Status.enabled) {
          output += `ERC-8004 Status: Enabled\n`;
          output += 'Your reputation is verifiable on-chain!';
        } else {
          output += 'ERC-8004 Status: Not enabled\n';
          output += 'Enable ERC-8004 to make your reputation portable and verifiable.';
        }
      } catch {
        output += 'ERC-8004 Status: Unknown';
      }

      return output;
    },
  });
}

/**
 * Class-based reputation tool (alternative API)
 */
export class XacheReputationTool {
  private tool: DynamicStructuredTool;

  constructor(config: ReputationToolConfig) {
    this.tool = createReputationTool(config);
  }

  asTool(): DynamicStructuredTool {
    return this.tool;
  }
}

/**
 * Utility class for checking reputation of any agent.
 *
 * @example
 * ```typescript
 * import { XacheReputationChecker } from '@xache/langchain';
 *
 * const checker = new XacheReputationChecker({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const rep = await checker.check('did:agent:evm:0xOtherAgent...');
 * if (rep.score >= 0.5) {
 *   console.log('Agent is trustworthy');
 * }
 * ```
 */
export class XacheReputationChecker {
  private client: XacheClient;

  constructor(config: ReputationToolConfig) {
    this.client = createClient(config);
  }

  /**
   * Check an agent's reputation
   */
  async check(agentDid: string): Promise<ReputationResult> {
    const result = await this.client.reputation.getReputation(agentDid as DID);

    // Overall score is 0-100, normalize to 0-1
    const score = (result.overall || 0) / 100;

    // Try to get ERC-8004 status
    let erc8004Enabled = false;
    let erc8004AgentId: string | undefined;
    try {
      const erc8004Status = await this.client.reputation.getERC8004Status();
      erc8004Enabled = erc8004Status.enabled;
    } catch {
      // ERC-8004 status not available
    }

    return {
      score,
      level: getLevel(score),
      totalContributions: 0, // Not available in current API
      totalPayments: 0, // Not available in current API
      erc8004Enabled,
      erc8004AgentId,
    };
  }

  /**
   * Check if an agent meets minimum reputation threshold
   */
  async meetsThreshold(agentDid: string, minScore: number): Promise<boolean> {
    const result = await this.check(agentDid);
    return result.score >= minScore;
  }
}
