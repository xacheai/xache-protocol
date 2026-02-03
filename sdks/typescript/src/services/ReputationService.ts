/**
 * Reputation Service
 * Query reputation scores and domain expertise per HLD §2.2
 * ERC-8004 portable reputation integration
 */

import type { XacheClient } from '../XacheClient';
import type {
  ReputationSnapshot,
  DomainReputation,
  TopAgent,
  DID,
  ERC8004FeedbackAuth,
  ERC8004EnableResponse,
  ERC8004ExportStatus,
  ERC8004TypedData,
} from '../types';

/**
 * Reputation service for reputation tracking and leaderboards
 */
export class ReputationService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Get current reputation snapshot for the authenticated agent
   * Free (no payment required)
   *
   * @param agentDID - Optional agent DID (defaults to authenticated agent)
   * @returns Current reputation snapshot with all scores
   *
   * @example
   * ```typescript
   * const reputation = await client.reputation.getReputation();
   *
   * console.log('Overall Score:', reputation.overall);
   * console.log('Memory Quality:', reputation.memoryQuality);
   * console.log('Contribution Success:', reputation.contribSuccess);
   * console.log('Economic Value:', reputation.economicValue);
   * ```
   */
  async getReputation(agentDID?: DID): Promise<ReputationSnapshot> {
    const endpoint = agentDID
      ? `/v1/reputation/${agentDID}`
      : '/v1/reputation';

    const response = await this.client.request<ReputationSnapshot>(
      'GET',
      endpoint
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get reputation');
    }

    return response.data;
  }

  /**
   * Get reputation history for the authenticated agent
   * Free (no payment required)
   *
   * @param agentDID - Optional agent DID (defaults to authenticated agent)
   * @param limit - Number of historical snapshots to retrieve (1-100, default: 30)
   * @returns Array of historical reputation snapshots
   *
   * @example
   * ```typescript
   * const history = await client.reputation.getHistory(undefined, 10);
   *
   * console.log(`Retrieved ${history.length} historical snapshots`);
   * history.forEach((snapshot, i) => {
   *   console.log(`${i + 1}. ${snapshot.timestamp}: ${snapshot.overall}`);
   * });
   * ```
   */
  async getHistory(agentDID?: DID, limit: number = 30): Promise<ReputationSnapshot[]> {
    // Validate limit
    this.validateLimit(limit);

    const endpoint = agentDID
      ? `/v1/reputation/${agentDID}/history?limit=${limit}`
      : `/v1/reputation/history?limit=${limit}`;

    const response = await this.client.request<ReputationSnapshot[]>(
      'GET',
      endpoint
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get reputation history');
    }

    return response.data;
  }

  /**
   * Get top agents by reputation score (leaderboard)
   * Free (no payment required)
   *
   * @param limit - Number of top agents to retrieve (1-100, default: 10)
   * @returns Array of top agents sorted by reputation score
   *
   * @example
   * ```typescript
   * const topAgents = await client.reputation.getTopAgents(10);
   *
   * console.log('Top 10 Agents:');
   * topAgents.forEach((agent, i) => {
   *   console.log(`${i + 1}. ${agent.agentDID}`);
   *   console.log(`   Score: ${agent.reputationScore}`);
   *   console.log(`   Operations: ${agent.operationCount}`);
   *   console.log(`   Earned: ${agent.totalEarnedUSD}`);
   * });
   * ```
   */
  async getTopAgents(limit: number = 10): Promise<TopAgent[]> {
    // Validate limit
    this.validateLimit(limit);

    const response = await this.client.request<TopAgent[]>(
      'GET',
      `/v1/reputation/leaderboard?limit=${limit}`,
      undefined,
      { skipAuth: true }
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get top agents');
    }

    return response.data;
  }

  /**
   * Get domain-specific reputation for an agent
   * Free (no payment required)
   *
   * @param domain - Domain name (e.g., 'javascript', 'python', 'devops')
   * @param agentDID - Optional agent DID (defaults to authenticated agent)
   * @returns Domain-specific reputation or null if no reputation in domain
   *
   * @example
   * ```typescript
   * const pythonRep = await client.reputation.getDomainReputation('python');
   *
   * if (pythonRep) {
   *   console.log('Python Domain Reputation:');
   *   console.log('  Score:', pythonRep.score);
   *   console.log('  Contributions:', pythonRep.contributionCount);
   *   console.log('  Success Rate:', pythonRep.successRate);
   *   console.log('  Total Earned:', pythonRep.totalEarnedUSD);
   * } else {
   *   console.log('No reputation in Python domain yet');
   * }
   * ```
   */
  async getDomainReputation(domain: string, agentDID?: DID): Promise<DomainReputation | null> {
    // Validate domain
    this.validateDomain(domain);

    const endpoint = agentDID
      ? `/v1/reputation/${agentDID}/domain/${domain}`
      : `/v1/reputation/domain/${domain}`;

    const response = await this.client.request<DomainReputation | null>(
      'GET',
      endpoint
    );

    if (!response.success) {
      throw new Error('Failed to get domain reputation');
    }

    return response.data || null;
  }

  /**
   * Get all domain reputations for an agent
   * Free (no payment required)
   *
   * @param agentDID - Optional agent DID (defaults to authenticated agent)
   * @returns Array of domain reputations
   *
   * @example
   * ```typescript
   * const domains = await client.reputation.getAllDomainReputations();
   *
   * console.log('Domain Expertise:');
   * domains.forEach(domain => {
   *   console.log(`${domain.domain}: ${domain.score} (${domain.contributionCount} contributions)`);
   * });
   * ```
   */
  async getAllDomainReputations(agentDID?: DID): Promise<DomainReputation[]> {
    const endpoint = agentDID
      ? `/v1/reputation/${agentDID}/domains`
      : '/v1/reputation/domains';

    const response = await this.client.request<DomainReputation[]>(
      'GET',
      endpoint
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get domain reputations');
    }

    return response.data;
  }

  // ===========================================================================
  // ERC-8004 Portable Reputation (https://www.8004.org/)
  // ===========================================================================

  /** ERC-8004 registry addresses */
  private static readonly ERC8004_REGISTRIES = {
    'base-sepolia': {
      identityRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
      chainId: 84532,
    },
    'base': {
      identityRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
      chainId: 8453,
    },
  } as const;

  /** Xache's export service address (authorized to submit feedback on your behalf) */
  private static readonly XACHE_EXPORT_SERVICE = '0x4A83c6f7EBfA661F97924acd10380DF75E7E4682';

  /**
   * Build ERC-8004 authorization for external signing
   *
   * Returns the EIP-712 typed data structure that must be signed by your wallet.
   * Use this with MetaMask, WalletConnect, Ledger, or any EIP-712 compatible signer.
   *
   * @param options - Configuration options
   * @returns Typed data for signing and authorization struct
   *
   * @example
   * ```typescript
   * // Step 1: Build the typed data
   * const { typedData, authorization } = client.reputation.buildERC8004Authorization({
   *   walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   expiryDays: 365,
   *   indexLimit: 100,
   * });
   *
   * // Step 2: Sign with your wallet (MetaMask example)
   * const signature = await window.ethereum.request({
   *   method: 'eth_signTypedData_v4',
   *   params: [walletAddress, JSON.stringify(typedData)],
   * });
   *
   * // Step 3: Submit the signature
   * await client.reputation.submitERC8004Authorization({
   *   authorization,
   *   signature,
   *   network: 'base-sepolia',
   * });
   * ```
   */
  buildERC8004Authorization(options: {
    /** Your wallet address that will sign the authorization */
    walletAddress: string;
    /** Number of days until authorization expires (default: 365) */
    expiryDays?: number;
    /** Maximum number of feedback entries allowed (default: 100) */
    indexLimit?: number;
    /** Network: 'base' or 'base-sepolia' (default: 'base-sepolia') */
    network?: 'base' | 'base-sepolia';
  }): { typedData: ERC8004TypedData; authorization: ERC8004FeedbackAuth } {
    const {
      walletAddress,
      expiryDays = 365,
      indexLimit = 100,
      network = 'base-sepolia',
    } = options;

    if (!walletAddress) {
      throw new Error('walletAddress is required');
    }

    const registry = ReputationService.ERC8004_REGISTRIES[network];
    const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

    const authorization: ERC8004FeedbackAuth = {
      agentId: '0', // Will be updated if agent is registered in 8004
      clientAddress: ReputationService.XACHE_EXPORT_SERVICE,
      indexLimit,
      expiry,
      chainId: registry.chainId,
      identityRegistry: registry.identityRegistry,
      signerAddress: walletAddress,
    };

    // EIP-712 typed data structure
    const typedData: ERC8004TypedData = {
      domain: {
        name: 'ERC8004ReputationRegistry',
        version: '1',
        chainId: registry.chainId,
        verifyingContract: registry.identityRegistry,
      },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        FeedbackAuth: [
          { name: 'agentId', type: 'uint256' },
          { name: 'clientAddress', type: 'address' },
          { name: 'indexLimit', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
          { name: 'identityRegistry', type: 'address' },
          { name: 'signerAddress', type: 'address' },
        ],
      },
      primaryType: 'FeedbackAuth',
      message: {
        agentId: authorization.agentId,
        clientAddress: authorization.clientAddress,
        indexLimit: authorization.indexLimit.toString(),
        expiry: authorization.expiry.toString(),
        chainId: authorization.chainId.toString(),
        identityRegistry: authorization.identityRegistry,
        signerAddress: authorization.signerAddress,
      },
    };

    return { typedData, authorization };
  }

  /**
   * Submit a signed ERC-8004 authorization
   *
   * After signing the typed data from buildERC8004Authorization(), submit
   * the signature to enable reputation export.
   *
   * @param options - Authorization and signature
   * @returns Authorization confirmation
   *
   * @example
   * ```typescript
   * const result = await client.reputation.submitERC8004Authorization({
   *   authorization,
   *   signature: '0x...',
   *   network: 'base-sepolia',
   * });
   *
   * console.log('ERC-8004 export enabled!');
   * console.log('Authorization ID:', result.authorizationId);
   * ```
   */
  async submitERC8004Authorization(options: {
    /** The authorization struct from buildERC8004Authorization() */
    authorization: ERC8004FeedbackAuth;
    /** The EIP-712 signature from your wallet */
    signature: string;
    /** Network: 'base' or 'base-sepolia' (default: 'base-sepolia') */
    network?: 'base' | 'base-sepolia';
  }): Promise<ERC8004EnableResponse> {
    const { authorization, signature, network = 'base-sepolia' } = options;

    if (!authorization || !signature) {
      throw new Error('authorization and signature are required');
    }

    const response = await this.client.request<ERC8004EnableResponse>(
      'POST',
      '/v1/reputation/erc8004/authorize',
      {
        authorization,
        signature,
        network,
      }
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to enable ERC-8004 export');
    }

    return response.data;
  }

  /**
   * Disable ERC-8004 reputation export
   *
   * Revokes the current authorization, preventing further reputation exports.
   *
   * @example
   * ```typescript
   * await client.reputation.disableERC8004Export();
   * console.log('ERC-8004 export disabled');
   * ```
   */
  async disableERC8004Export(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.request<{ success: boolean; message: string }>(
      'DELETE',
      '/v1/reputation/erc8004/authorize'
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to disable ERC-8004 export');
    }

    return response.data;
  }

  /**
   * Get ERC-8004 export status
   *
   * Check if ERC-8004 export is enabled and view export history.
   *
   * @example
   * ```typescript
   * const status = await client.reputation.getERC8004Status();
   *
   * if (status.enabled) {
   *   console.log('ERC-8004 export is enabled');
   *   console.log('Expires:', status.expiresAt);
   *   console.log('Feedbacks used:', status.feedbacksUsed, '/', status.feedbacksLimit);
   *   if (status.lastExportedAt) {
   *     console.log('Last exported:', status.lastExportedAt);
   *     console.log('Score:', status.lastExportedScore);
   *   }
   * } else {
   *   console.log('ERC-8004 export is not enabled');
   *   console.log('Enable with: client.reputation.enableERC8004Export()');
   * }
   * ```
   */
  async getERC8004Status(): Promise<ERC8004ExportStatus> {
    const response = await this.client.request<ERC8004ExportStatus>(
      'GET',
      '/v1/reputation/erc8004/status'
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get ERC-8004 status');
    }

    return response.data;
  }

  /**
   * Validate limit parameter
   */
  private validateLimit(limit: number): void {
    if (typeof limit !== 'number') {
      throw new Error('limit must be a number');
    }

    if (!Number.isInteger(limit)) {
      throw new Error('limit must be an integer');
    }

    if (limit < 1 || limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
  }

  /**
   * Validate domain parameter
   */
  private validateDomain(domain: string): void {
    if (!domain || typeof domain !== 'string') {
      throw new Error('domain is required and must be a string');
    }

    if (domain.length < 2) {
      throw new Error('domain must be at least 2 characters');
    }

    if (domain.length > 50) {
      throw new Error('domain must be at most 50 characters');
    }

    // Domain should only contain lowercase letters, numbers, and hyphens
    if (!/^[a-z0-9-]+$/.test(domain)) {
      throw new Error('domain must only contain lowercase letters, numbers, and hyphens');
    }
  }
}
