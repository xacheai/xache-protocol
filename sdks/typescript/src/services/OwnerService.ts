/**
 * Owner Service
 * Owner identity registration, verification, and management
 */

import type { XacheClient } from '../XacheClient';
import type { DID } from '../types';

/**
 * Owner entity types
 */
export type EntityType = 'human' | 'organization';

/**
 * Wallet chain types
 */
export type WalletChain = 'evm' | 'solana';

/**
 * Owner profile information
 */
export interface Owner {
  ownerDID: DID;
  walletAddress: string;
  walletChain: WalletChain;
  entityType: EntityType;
  displayName?: string;
  organizationName?: string;
  email?: string;
  emailVerified: boolean;
  walletVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Owned agent information
 */
export interface OwnedAgent {
  agentDID: DID;
  walletAddress: string;
  chain: string;
  claimType: 'individual' | 'workspace';
  workspaceId?: string;
  workspaceName?: string;
  role?: 'admin' | 'member';
  addedAt: string;
}

/**
 * Register owner request
 */
export interface RegisterOwnerRequest {
  walletAddress: string;
  walletChain: WalletChain;
  entityType: EntityType;
  displayName?: string;
  organizationName?: string;
  email?: string;
  supabaseUserId?: string;
}

/**
 * Verify wallet request
 */
export interface VerifyWalletRequest {
  ownerDID: DID;
  message: string;
  signature: string;
  timestamp: number;
}

/**
 * Update owner profile request
 */
export interface UpdateOwnerRequest {
  displayName?: string;
  organizationName?: string;
  email?: string;
}

/**
 * Owner service for identity registration and management
 */
export class OwnerService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Register a new owner (human or organization)
   *
   * @example
   * ```typescript
   * const owner = await client.owner.register({
   *   walletAddress: '0x1234...',
   *   walletChain: 'evm',
   *   entityType: 'human',
   *   displayName: 'John Doe',
   *   email: 'john@example.com',
   * });
   * console.log('Owner registered:', owner.ownerDID);
   * ```
   */
  async register(params: RegisterOwnerRequest): Promise<Owner> {
    const response = await this.client.request<{ owner: Owner }>(
      'POST',
      '/v1/owners/register',
      { ...params },
      { skipAuth: true }
    );

    if (!response.success || !response.data?.owner) {
      throw new Error(response.error?.message || 'Failed to register owner');
    }

    return response.data.owner;
  }

  /**
   * Verify wallet ownership with cryptographic signature
   *
   * @example
   * ```typescript
   * const verified = await client.owner.verifyWallet({
   *   ownerDID: 'did:owner:evm:0x1234...',
   *   message: 'Verify wallet ownership',
   *   signature: '0x...',
   *   timestamp: Date.now(),
   * });
   * console.log('Wallet verified:', verified);
   * ```
   */
  async verifyWallet(params: VerifyWalletRequest): Promise<boolean> {
    const response = await this.client.request<{ verified: boolean }>(
      'POST',
      '/v1/owners/verify-wallet',
      { ...params },
      { skipAuth: true }
    );

    if (!response.success || response.data?.verified === undefined) {
      throw new Error(response.error?.message || 'Failed to verify wallet');
    }

    return response.data.verified;
  }

  /**
   * Get the authenticated owner's profile
   * Requires authentication
   *
   * @example
   * ```typescript
   * const profile = await client.owner.getProfile();
   * if (profile) {
   *   console.log('Display name:', profile.displayName);
   *   console.log('Email verified:', profile.emailVerified);
   * }
   * ```
   */
  async getProfile(): Promise<Owner | null> {
    const response = await this.client.request<{ owner: Owner | null }>(
      'GET',
      '/v1/owners/me'
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to get owner profile');
    }

    return response.data?.owner || null;
  }

  /**
   * Update the authenticated owner's profile
   * Requires authentication
   *
   * @example
   * ```typescript
   * const updated = await client.owner.updateProfile({
   *   displayName: 'Jane Doe',
   *   organizationName: 'Acme Corp',
   * });
   * console.log('Profile updated:', updated.displayName);
   * ```
   */
  async updateProfile(params: UpdateOwnerRequest): Promise<Owner> {
    const response = await this.client.request<{ owner: Owner }>(
      'PATCH',
      '/v1/owners/me',
      { ...params }
    );

    if (!response.success || !response.data?.owner) {
      throw new Error(response.error?.message || 'Failed to update owner profile');
    }

    return response.data.owner;
  }

  /**
   * Get all agents owned by the authenticated owner
   * Includes individually claimed agents and workspace members
   * Requires authentication
   *
   * @example
   * ```typescript
   * const { agents, count } = await client.owner.getOwnedAgents();
   * console.log('Total owned agents:', count);
   *
   * agents.forEach(agent => {
   *   console.log(`${agent.agentDID} - ${agent.claimType}`);
   *   if (agent.workspaceName) {
   *     console.log(`  Workspace: ${agent.workspaceName} (${agent.role})`);
   *   }
   * });
   * ```
   */
  async getOwnedAgents(): Promise<{ agents: OwnedAgent[]; count: number }> {
    const response = await this.client.request<{ agents: OwnedAgent[]; count: number }>(
      'GET',
      '/v1/owners/me/agents'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get owned agents');
    }

    return response.data;
  }

  /**
   * Purge all memories for a subject across owned agents (GDPR right-to-forget)
   * This is irreversible. Receipts are optionally deleted.
   * Requires owner authentication.
   *
   * @example
   * ```typescript
   * const result = await client.owner.purgeSubject({
   *   subjectId: 'a1b2c3...', // 64-char hex subject ID
   *   deleteReceipts: false,   // keep audit trail by default
   * });
   * console.log('Memories deleted:', result.memoriesDeleted);
   * ```
   */
  async purgeSubject(params: {
    subjectId: string;
    deleteReceipts?: boolean;
  }): Promise<{
    subjectId: string;
    memoriesDeleted: number;
    receiptsDeleted?: number;
  }> {
    if (!params.subjectId) {
      throw new Error('subjectId is required');
    }

    const response = await this.client.request<{
      subjectId: string;
      memoriesDeleted: number;
      receiptsDeleted?: number;
    }>(
      'DELETE',
      `/v1/subjects/${params.subjectId}/purge`,
      { deleteReceipts: params.deleteReceipts || false }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Subject purge failed');
    }

    return response.data;
  }
}
