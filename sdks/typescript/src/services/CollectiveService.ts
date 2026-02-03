/**
 * Collective Service
 * Contribute and query heuristics per LLD §2.5
 */

import type { XacheClient } from '../XacheClient';
import type {
  ContributeHeuristicRequest,
  ContributeHeuristicResponse,
  QueryCollectiveRequest,
  QueryCollectiveResponse,
} from '../types';

/**
 * Collective service for heuristic marketplace
 */
export class CollectiveService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Contribute a heuristic to the collective per LLD §2.5
   * Cost: $0.001 (automatic 402 payment)
   *
   * @example
   * ```typescript
   * const heuristic = await client.collective.contribute({
   *   pattern: 'Use async/await for cleaner async code',
   *   domain: 'javascript',
   *   tags: ['async', 'best-practices'],
   *   contextType: 'code-review',
   * });
   *
   * console.log('Heuristic ID:', heuristic.heuristicId);
   * ```
   */
  async contribute(request: ContributeHeuristicRequest): Promise<ContributeHeuristicResponse> {
    // Validate request
    this.validateContributeRequest(request);

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<ContributeHeuristicResponse>(
      'POST',
      '/v1/collective/contribute',
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Heuristic contribution failed');
    }

    return response.data;
  }

  /**
   * Query the collective for relevant heuristics per LLD §2.5
   * Cost: $0.01 + royalties (automatic 402 payment)
   *
   * @example
   * ```typescript
   * const results = await client.collective.query({
   *   queryText: 'How to optimize database queries in Node.js',
   *   domain: 'nodejs',
   *   limit: 10,
   * });
   *
   * console.log('Matches:', results.matches.length);
   * console.log('Total cost:', results.totalCost);
   *
   * results.matches.forEach(match => {
   *   console.log(`- ${match.pattern} (score: ${match.relevanceScore})`);
   * });
   * ```
   */
  async query(request: QueryCollectiveRequest): Promise<QueryCollectiveResponse> {
    // Validate request
    this.validateQueryRequest(request);

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<QueryCollectiveResponse>(
      'POST',
      '/v1/collective/query',
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Collective query failed');
    }

    return response.data;
  }

  /**
   * Validate contribution request
   */
  private validateContributeRequest(request: ContributeHeuristicRequest): void {
    // Validate pattern
    if (!request.pattern || typeof request.pattern !== 'string') {
      throw new Error('pattern is required and must be a string');
    }

    if (request.pattern.length < 10) {
      throw new Error('pattern must be at least 10 characters');
    }

    if (request.pattern.length > 500) {
      throw new Error('pattern must be at most 500 characters');
    }

    // Validate patternHash (required per LLD §2.4)
    if (!request.patternHash || typeof request.patternHash !== 'string') {
      throw new Error('patternHash is required and must be a string');
    }

    // Validate domain
    if (!request.domain || typeof request.domain !== 'string') {
      throw new Error('domain is required and must be a string');
    }

    // Validate tags
    if (!Array.isArray(request.tags) || request.tags.length === 0) {
      throw new Error('tags must be a non-empty array');
    }

    if (request.tags.length > 10) {
      throw new Error('tags must have at most 10 items');
    }

    if (!request.tags.every((tag) => typeof tag === 'string')) {
      throw new Error('all tags must be strings');
    }

    // Validate metrics (required per LLD §2.4)
    if (!request.metrics || typeof request.metrics !== 'object') {
      throw new Error('metrics is required and must be an object');
    }

    if (typeof request.metrics.successRate !== 'number') {
      throw new Error('metrics.successRate is required and must be a number');
    }

    if (request.metrics.successRate < 0 || request.metrics.successRate > 1) {
      throw new Error('metrics.successRate must be between 0 and 1');
    }

    if (typeof request.metrics.sampleSize !== 'number' || request.metrics.sampleSize < 1) {
      throw new Error('metrics.sampleSize is required and must be a positive number');
    }

    if (typeof request.metrics.confidence !== 'number') {
      throw new Error('metrics.confidence is required and must be a number');
    }

    if (request.metrics.confidence < 0 || request.metrics.confidence > 1) {
      throw new Error('metrics.confidence must be between 0 and 1');
    }

    // Validate encryptedContentRef (required per LLD §2.4)
    if (!request.encryptedContentRef || typeof request.encryptedContentRef !== 'string') {
      throw new Error('encryptedContentRef is required and must be a string');
    }
  }

  /**
   * Validate query request
   */
  private validateQueryRequest(request: QueryCollectiveRequest): void {
    if (!request.queryText || typeof request.queryText !== 'string') {
      throw new Error('queryText is required and must be a string');
    }

    if (request.queryText.length < 5) {
      throw new Error('queryText must be at least 5 characters');
    }

    if (request.queryText.length > 500) {
      throw new Error('queryText must be at most 500 characters');
    }

    if (request.limit !== undefined) {
      if (typeof request.limit !== 'number' || request.limit < 1 || request.limit > 50) {
        throw new Error('limit must be a number between 1 and 50');
      }
    }
  }

  /**
   * List heuristics in the collective
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const heuristics = await client.collective.listHeuristics({
   *   domain: 'javascript',
   *   limit: 20,
   * });
   *
   * console.log('Total:', heuristics.total);
   * heuristics.heuristics.forEach(h => {
   *   console.log(`- ${h.heuristicKey}: ${h.description}`);
   * });
   * ```
   */
  async listHeuristics(options?: {
    domain?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    heuristics: Array<{
      heuristicKey: string;
      description: string;
      domain: string;
      tags: string[];
      contributorDID: string;
      createdAt: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (options?.domain) params.append('domain', options.domain);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    const queryString = params.toString();
    const path = queryString ? `/v1/collective/heuristics?${queryString}` : '/v1/collective/heuristics';

    const response = await this.client.request<{
      heuristics: Array<{
        heuristicKey: string;
        description: string;
        domain: string;
        tags: string[];
        contributorDID: string;
        createdAt: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(
      'GET',
      path,
      undefined,
      { skipAuth: true }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to list heuristics');
    }

    return response.data;
  }
}
