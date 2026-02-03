/**
 * Identity Service
 * Agent identity registration per LLD §2.2
 */

import type { XacheClient } from '../XacheClient';
import type {
  RegisterIdentityRequest,
  RegisterIdentityResponse,
  GetIdentityResponse,
  UpdateIdentityRequest,
  UpdateIdentityResponse,
  SubmitClaimRequest,
  SubmitClaimResponse,
  ProcessClaimRequest,
  ProcessClaimResponse,
  PendingClaim,
  PendingClaimByOwner,
  OnChainClaimRequest,
  OnChainClaimResponse,
  DID,
} from '../types';

/**
 * Identity service for agent registration
 */
export class IdentityService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Register a new agent identity per LLD §2.2
   *
   * @example
   * ```typescript
   * // Basic registration
   * const identity = await client.identity.register({
   *   walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   keyType: 'evm',
   *   chain: 'base',
   * });
   *
   * console.log('DID:', identity.did);
   *
   * // Option A: SDK Auto-Registration with owner
   * const identityWithOwner = await client.identity.register({
   *   walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   keyType: 'evm',
   *   chain: 'base',
   *   ownerDID: 'did:owner:evm:0x123...', // Agent automatically linked to owner
   * });
   * ```
   */
  async register(request: RegisterIdentityRequest): Promise<RegisterIdentityResponse> {
    // Validate request
    this.validateRegisterRequest(request);

    // Make API request (no authentication required for registration)
    const response = await this.client.request<RegisterIdentityResponse>(
      'POST',
      '/v1/identity/register',
      request,
      { skipAuth: true }
    );

    if (!response.success || !response.data) {
      throw new Error('Identity registration failed');
    }

    return response.data;
  }

  /**
   * Get agent identity by DID
   *
   * @example
   * ```typescript
   * // Get agent by DID
   * const identity = await client.identity.get('did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
   * console.log('Agent:', identity);
   * ```
   */
  async get(did: DID): Promise<GetIdentityResponse> {
    if (!did) {
      throw new Error('DID is required');
    }

    const response = await this.client.request<GetIdentityResponse>(
      'GET',
      `/v1/identity/${did}`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get identity');
    }

    return response.data;
  }

  /**
   * Update agent identity
   *
   * @example
   * ```typescript
   * // Update agent name
   * const updated = await client.identity.update('did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', {
   *   name: 'My Agent',
   * });
   * console.log('Updated:', updated);
   *
   * // Update agent metadata
   * const updated = await client.identity.update('did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', {
   *   metadata: { version: '1.0', capabilities: ['text', 'code'] },
   * });
   * console.log('Updated:', updated);
   *
   * // Update both name and metadata
   * const updated = await client.identity.update('did:agent:evm:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', {
   *   name: 'My Agent',
   *   metadata: { version: '1.0' },
   * });
   * ```
   */
  async update(did: DID, request: UpdateIdentityRequest): Promise<UpdateIdentityResponse> {
    if (!did) {
      throw new Error('DID is required');
    }

    if (!request.name && !request.metadata) {
      throw new Error('At least one of name or metadata must be provided');
    }

    const response = await this.client.request<UpdateIdentityResponse>(
      'PUT',
      `/v1/identity/${did}`,
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to update identity');
    }

    return response.data;
  }

  /**
   * Delete agent identity (soft delete)
   *
   * @example
   * ```typescript
   * // Delete agent identity
   * await client.identity.delete('did:agent:evm:0x...');
   * console.log('Agent deleted successfully');
   * ```
   */
  async delete(did: DID): Promise<{ message: string }> {
    if (!did) {
      throw new Error('DID is required');
    }

    const response = await this.client.request<{ message: string }>(
      'DELETE',
      `/v1/identity/${did}`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to delete identity');
    }

    return response.data;
  }

  /**
   * Submit ownership claim request (Option B: Async Claim Approval)
   *
   * @example
   * ```typescript
   * // Submit a claim request for an agent
   * const claim = await client.identity.submitClaimRequest({
   *   agentDID: 'did:agent:evm:0x...',
   *   webhookUrl: 'https://my-app.com/webhooks/claim-notification', // optional
   * });
   *
   * console.log('Claim submitted:', claim.status); // 'pending'
   * console.log('Claim ID:', claim.claimId);
   * ```
   */
  async submitClaimRequest(request: SubmitClaimRequest): Promise<SubmitClaimResponse> {
    if (!request.agentDID) {
      throw new Error('agentDID is required');
    }

    const response = await this.client.request<SubmitClaimResponse>(
      'POST',
      '/v1/ownership/claim-request',
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to submit claim request');
    }

    return response.data;
  }

  /**
   * Process ownership claim (approve/reject) (Option B: Async Claim Approval)
   *
   * @example
   * ```typescript
   * // Agent approves a claim
   * const result = await agentClient.identity.processClaimRequest({
   *   ownerDID: 'did:owner:evm:0x...',
   *   approved: true,
   *   ownerSignature: '0x...',
   *   agentSignature: '0x...',
   *   message: 'Ownership claim approval',
   *   timestamp: Date.now(),
   * });
   *
   * console.log('Claim status:', result.status); // 'approved'
   *
   * // Agent rejects a claim
   * const rejected = await agentClient.identity.processClaimRequest({
   *   ownerDID: 'did:owner:evm:0x...',
   *   approved: false,
   *   rejectionReason: 'Invalid claim',
   * });
   *
   * console.log('Claim status:', rejected.status); // 'rejected'
   * ```
   */
  async processClaimRequest(request: ProcessClaimRequest): Promise<ProcessClaimResponse> {
    if (!request.ownerDID) {
      throw new Error('ownerDID is required');
    }

    if (typeof request.approved !== 'boolean') {
      throw new Error('approved field is required');
    }

    if (request.approved && (!request.ownerSignature || !request.agentSignature)) {
      throw new Error('Signatures are required when approving a claim');
    }

    const response = await this.client.request<ProcessClaimResponse>(
      'POST',
      '/v1/ownership/claim-process',
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to process claim request');
    }

    return response.data;
  }

  /**
   * Get pending claims for the authenticated agent (Option B: Async Claim Approval)
   *
   * @example
   * ```typescript
   * // Agent checks pending claims
   * const pendingClaims = await agentClient.identity.getPendingClaimsForAgent();
   *
   * console.log(`You have ${pendingClaims.count} pending claim(s)`);
   *
   * pendingClaims.claims.forEach(claim => {
   *   console.log(`Owner: ${claim.ownerDID}`);
   *   console.log(`Requested at: ${claim.requestedAt}`);
   *   console.log(`Webhook: ${claim.webhookUrl || 'None'}`);
   * });
   * ```
   */
  async getPendingClaimsForAgent(): Promise<{ claims: PendingClaim[]; count: number }> {
    const agentDID = this.client.getConfig().did;

    const response = await this.client.request<{ claims: PendingClaim[]; count: number }>(
      'GET',
      `/v1/ownership/pending-claims/${agentDID}`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get pending claims');
    }

    return response.data;
  }

  /**
   * Get pending claims by the authenticated owner (Option B: Async Claim Approval)
   *
   * @example
   * ```typescript
   * // Owner checks their submitted claims
   * const myClaims = await ownerClient.identity.getPendingClaimsByOwner();
   *
   * console.log(`You have submitted ${myClaims.count} claim(s)`);
   *
   * myClaims.claims.forEach(claim => {
   *   console.log(`Agent: ${claim.agentDID}`);
   *   console.log(`Status: ${claim.status}`);
   *   console.log(`Requested at: ${claim.requestedAt}`);
   * });
   * ```
   */
  async getPendingClaimsByOwner(): Promise<{ claims: PendingClaimByOwner[]; count: number }> {
    const ownerDID = this.client.getConfig().did;

    const response = await this.client.request<{ claims: PendingClaimByOwner[]; count: number }>(
      'GET',
      `/v1/ownership/pending-claims/owner/${ownerDID}`
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get pending claims');
    }

    return response.data;
  }

  /**
   * Claim agent ownership via on-chain transaction (Option C: On-chain Claiming)
   *
   * @example
   * ```typescript
   * // Claim ownership by providing a Solana transaction hash
   * const result = await ownerClient.identity.claimOnChain({
   *   agentDID: 'did:agent:sol:...',
   *   txHash: '5wHu7...', // Solana transaction signature
   *   chain: 'solana',
   * });
   *
   * console.log('Ownership claimed via on-chain transaction');
   * console.log('Status:', result.status); // 'approved'
   * console.log('Transaction:', result.txHash);
   * console.log('Method:', result.method); // 'onchain-solana'
   *
   * // Claim ownership by providing a Base (EVM) transaction hash
   * const evmResult = await ownerClient.identity.claimOnChain({
   *   agentDID: 'did:agent:evm:0x...',
   *   txHash: '0xabc123...', // EVM transaction hash
   *   chain: 'base',
   * });
   *
   * console.log('Ownership claimed via Base transaction');
   * console.log('Status:', evmResult.status); // 'approved'
   * ```
   */
  async claimOnChain(request: OnChainClaimRequest): Promise<OnChainClaimResponse> {
    if (!request.agentDID) {
      throw new Error('agentDID is required');
    }

    if (!request.txHash) {
      throw new Error('txHash is required');
    }

    if (!request.chain || !['solana', 'base'].includes(request.chain)) {
      throw new Error('chain must be "solana" or "base"');
    }

    const response = await this.client.request<OnChainClaimResponse>(
      'POST',
      '/v1/ownership/claim-onchain',
      request
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to claim ownership on-chain');
    }

    return response.data;
  }

  /**
   * Validate registration request
   */
  private validateRegisterRequest(request: RegisterIdentityRequest): void {
    if (!request.walletAddress) {
      throw new Error('walletAddress is required');
    }

    if (!request.keyType || !['evm', 'solana'].includes(request.keyType)) {
      throw new Error('keyType must be "evm" or "solana"');
    }

    if (!request.chain || !['base', 'solana'].includes(request.chain)) {
      throw new Error('chain must be "base" or "solana"');
    }

    // Validate wallet address format
    if (request.keyType === 'evm') {
      // EVM addresses: 0x + 40 hex chars
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
        throw new Error('Invalid EVM wallet address format');
      }
    } else {
      // Solana addresses: 32-44 base58 chars
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(request.walletAddress)) {
        throw new Error('Invalid Solana wallet address format');
      }
    }
  }
}
