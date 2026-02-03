/**
 * Royalty Service
 * Revenue tracking and earnings management for heuristic contributors
 */

import type { XacheClient } from '../XacheClient';
import type { DID } from '../types';

/**
 * Revenue statistics for an agent
 */
export interface RevenueStats {
  agentDID: DID;
  totalEarnedUSD: string;
  heuristicCount: number;
  topHeuristics: Array<{
    heuristicId: string;
    pattern: string;
    domain: string;
    earnedUSD: string;
    usageCount: number;
  }>;
  earningsByDomain: Record<string, string>;
  monthlyEarnings: Array<{
    month: string;
    earnedUSD: string;
  }>;
}

/**
 * Pending payout information
 */
export interface PendingPayout {
  heuristicId: string;
  heuristicKey: string;
  pendingAmount: string;
  lastQueryAt: string;
  queryCount: number;
}

/**
 * Platform-wide revenue statistics
 */
export interface PlatformRevenue {
  totalRevenue: string;
  totalAgents: number;
  totalHeuristics: number;
  totalQueries: number;
  averageRevenuePerAgent: string;
}

/**
 * Top earner information
 */
export interface TopEarner {
  rank: number;
  agentDID: DID;
  totalEarnedUSD: string;
  heuristicCount: number;
  reputationScore: number;
}

/**
 * Royalty service for revenue tracking and earnings management
 */
export class RoyaltyService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Get revenue statistics for an agent
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const stats = await client.royalty.getRevenueStats('did:agent:evm:0x1234...');
   *
   * console.log('Total earned:', stats.totalEarnedUSD, 'USD');
   * console.log('Heuristics:', stats.heuristicCount);
   *
   * // Top performing heuristics
   * stats.topHeuristics.forEach(h => {
   *   console.log(`  ${h.domain}: $${h.earnedUSD} (${h.usageCount} uses)`);
   * });
   *
   * // Monthly breakdown
   * stats.monthlyEarnings.forEach(m => {
   *   console.log(`  ${m.month}: $${m.earnedUSD}`);
   * });
   * ```
   */
  async getRevenueStats(agentDID: DID): Promise<RevenueStats> {
    const response = await this.client.request<RevenueStats>(
      'GET',
      `/v1/royalty/revenue/${encodeURIComponent(agentDID)}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get revenue stats');
    }

    return response.data;
  }

  /**
   * Get pending payouts for an agent
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const { pendingPayouts, totalPendingAmount } = await client.royalty.getPendingPayouts(
   *   'did:agent:evm:0x1234...'
   * );
   *
   * console.log('Total pending:', totalPendingAmount, 'USD');
   *
   * pendingPayouts.forEach(p => {
   *   console.log(`  ${p.heuristicKey}: $${p.pendingAmount}`);
   * });
   * ```
   */
  async getPendingPayouts(agentDID: DID): Promise<{
    agentDID: DID;
    pendingPayouts: PendingPayout[];
    totalPendingCount: number;
    totalPendingAmount: string;
  }> {
    const response = await this.client.request<{
      agentDID: DID;
      pendingPayouts: PendingPayout[];
      totalPendingCount: number;
      totalPendingAmount: string;
    }>('GET', `/v1/royalty/payouts/${encodeURIComponent(agentDID)}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get pending payouts');
    }

    return response.data;
  }

  /**
   * Get platform-wide revenue statistics
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const platform = await client.royalty.getPlatformRevenue();
   *
   * console.log('Platform revenue:', platform.totalRevenue, 'USD');
   * console.log('Active agents:', platform.totalAgents);
   * console.log('Total heuristics:', platform.totalHeuristics);
   * console.log('Total queries:', platform.totalQueries);
   * console.log('Avg per agent:', platform.averageRevenuePerAgent, 'USD');
   * ```
   */
  async getPlatformRevenue(): Promise<PlatformRevenue> {
    const response = await this.client.request<PlatformRevenue>(
      'GET',
      '/v1/royalty/platform'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get platform revenue');
    }

    return response.data;
  }

  /**
   * Get top earning agents
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const { topEarners } = await client.royalty.getTopEarners(10);
   *
   * topEarners.forEach(earner => {
   *   console.log(`#${earner.rank} ${earner.agentDID}`);
   *   console.log(`   Earned: $${earner.totalEarnedUSD}`);
   *   console.log(`   Heuristics: ${earner.heuristicCount}`);
   *   console.log(`   Reputation: ${earner.reputationScore}`);
   * });
   * ```
   */
  async getTopEarners(limit: number = 20): Promise<{
    topEarners: TopEarner[];
    total: number;
  }> {
    const response = await this.client.request<{
      topEarners: TopEarner[];
      total: number;
    }>('GET', `/v1/royalty/top-earners?limit=${limit}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get top earners');
    }

    return response.data;
  }

  /**
   * Get revenue stats for the current authenticated agent
   * Convenience method that uses the client's DID
   *
   * @example
   * ```typescript
   * const myStats = await client.royalty.getMyRevenue();
   * console.log('My earnings:', myStats.totalEarnedUSD, 'USD');
   * ```
   */
  async getMyRevenue(): Promise<RevenueStats> {
    const did = this.client.getDID();
    if (!did) {
      throw new Error('Client DID not set');
    }
    return this.getRevenueStats(did);
  }

  /**
   * Get pending payouts for the current authenticated agent
   * Convenience method that uses the client's DID
   *
   * @example
   * ```typescript
   * const { pendingPayouts, totalPendingAmount } = await client.royalty.getMyPendingPayouts();
   * console.log('Pending earnings:', totalPendingAmount, 'USD');
   * ```
   */
  async getMyPendingPayouts(): Promise<{
    agentDID: DID;
    pendingPayouts: PendingPayout[];
    totalPendingCount: number;
    totalPendingAmount: string;
  }> {
    const did = this.client.getDID();
    if (!did) {
      throw new Error('Client DID not set');
    }
    return this.getPendingPayouts(did);
  }
}
