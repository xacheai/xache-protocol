/**
 * Receipt Service
 * Access receipts and Merkle proofs
 */

import type { XacheClient } from '../XacheClient';
import type { Receipt, ReceiptWithProof, UsageAnalytics } from '../types';

/**
 * Receipt service for transaction records
 */
export class ReceiptService {
  constructor(private readonly client: XacheClient) {}

  /**
   * List receipts for authenticated agent
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const receipts = await client.receipts.list({
   *   limit: 20,
   *   offset: 0,
   * });
   *
   * receipts.forEach(receipt => {
   *   console.log(`${receipt.operation}: $${receipt.amountUSD} at ${receipt.timestamp}`);
   * });
   * ```
   */
  async list(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ receipts: Receipt[]; total: number; limit: number; offset: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    // Validate options
    this.validateListOptions(limit, offset);

    // Make API request (authenticated, no payment)
    const response = await this.client.request<{
      receipts: Receipt[];
      total: number;
      limit: number;
      offset: number;
    }>(
      'GET',
      `/v1/receipts?limit=${limit}&offset=${offset}`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to list receipts');
    }

    return response.data;
  }

  /**
   * Get Merkle proof for a receipt
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const proof = await client.receipts.getProof('receipt_abc123');
   *
   * console.log('Merkle Root:', proof.merkleRoot);
   * console.log('Proof length:', proof.merkleProof.length);
   * ```
   */
  async getProof(receiptId: string): Promise<ReceiptWithProof> {
    // Validate receiptId
    if (!receiptId || typeof receiptId !== 'string') {
      throw new Error('receiptId is required and must be a string');
    }

    // Make API request (authenticated, no payment)
    const response = await this.client.request<ReceiptWithProof>(
      'GET',
      `/v1/receipts/${receiptId}/proof`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get receipt proof');
    }

    return response.data;
  }

  /**
   * Get usage analytics
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const analytics = await client.receipts.getAnalytics({
   *   startDate: '2024-01-01',
   *   endDate: '2024-01-31',
   * });
   *
   * console.log('Total spent:', analytics.totalSpent);
   * analytics.operations.forEach(op => {
   *   console.log(`${op.operation}: ${op.count} times, $${op.totalCost}`);
   * });
   * ```
   */
  async getAnalytics(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<UsageAnalytics> {
    // Build query parameters
    const params = new URLSearchParams();
    if (options?.startDate) {
      params.append('startDate', options.startDate);
    }
    if (options?.endDate) {
      params.append('endDate', options.endDate);
    }

    const queryString = params.toString();
    const path = queryString ? `/v1/analytics/usage?${queryString}` : '/v1/analytics/usage';

    // Make API request (authenticated, no payment)
    const response = await this.client.request<UsageAnalytics>(
      'GET',
      path
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get usage analytics');
    }

    return response.data;
  }

  /**
   * Get receipts for specific operation type
   * Utility method
   */
  async getByOperation(operation: string, limit: number = 50): Promise<Receipt[]> {
    const result = await this.list({ limit: 100 }); // Get more to filter

    return result.receipts
      .filter((receipt) => receipt.operation === operation)
      .slice(0, limit);
  }

  /**
   * Calculate total spending
   * Utility method
   */
  async getTotalSpending(): Promise<number> {
    const result = await this.list({ limit: 1000 });

    return result.receipts.reduce((total, receipt) => {
      return total + parseFloat(receipt.amountUSD);
    }, 0);
  }

  /**
   * Validate list options
   */
  private validateListOptions(limit: number, offset: number): void {
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('limit must be a number between 1 and 100');
    }

    if (typeof offset !== 'number' || offset < 0) {
      throw new Error('offset must be a non-negative number');
    }
  }

  // ========== Merkle Anchors ==========

  /**
   * List Merkle root anchors with chain status
   * Shows hourly batches of receipts anchored to blockchain
   *
   * @example
   * ```typescript
   * const anchors = await client.receipts.listAnchors({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-31T23:59:59Z',
   *   limit: 50
   * });
   *
   * anchors.anchors.forEach(anchor => {
   *   console.log(`${anchor.hour}: ${anchor.receiptCount} receipts`);
   *   if (anchor.base) {
   *     console.log(`  Base TX: ${anchor.base.txHash}`);
   *   }
   *   if (anchor.solana) {
   *     console.log(`  Solana TX: ${anchor.solana.txHash}`);
   *   }
   *   if (anchor.dualAnchored) {
   *     console.log('  ✓ Dual-anchored');
   *   }
   * });
   * ```
   */
  async listAnchors(options?: {
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AnchorListResponse> {
    const params = new URLSearchParams();
    if (options?.from) params.append('from', options.from);
    if (options?.to) params.append('to', options.to);
    if (options?.limit) params.append('limit', String(options.limit));

    const queryString = params.toString();
    const path = queryString ? `/v1/anchors?${queryString}` : '/v1/anchors';

    const response = await this.client.request<AnchorListResponse>(
      'GET',
      path,
      undefined,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to list anchors');
    }

    return response.data;
  }
}

/**
 * Chain anchor status
 */
export interface ChainAnchor {
  txHash: string;
  gasUsed?: number;
  status: string;
  anchoredAt?: string;
}

/**
 * Merkle anchor batch
 */
export interface MerkleAnchor {
  hour: string;
  merkleRoot: string;
  receiptCount: number;
  base: ChainAnchor | null;
  solana: ChainAnchor | null;
  dualAnchored: boolean;
}

/**
 * Anchor list response
 */
export interface AnchorListResponse {
  anchors: MerkleAnchor[];
  total: number;
  period: {
    from: string;
    to: string;
  };
}
