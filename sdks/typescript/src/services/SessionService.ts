/**
 * Session Service for x402 v2 Wallet-Based Sessions
 *
 * Manages wallet sessions to skip repeated payment flows.
 * Per x402 v2 spec: https://www.x402.org/writing/x402-v2-launch
 */

import type { XacheClient } from '../XacheClient';
import type { NetworkId } from './FacilitatorService';

/**
 * Session scope defines what operations a session can authorize
 */
export type SessionScope = 'memory:store' | 'memory:retrieve' | 'collective:contribute' | 'collective:query' | '*';

/**
 * Wallet session configuration
 */
export interface WalletSession {
  sessionId: string;
  walletAddress: string;
  chain: 'evm' | 'solana';
  network: NetworkId;
  createdAt: number;
  expiresAt: number;
  scope: SessionScope[];
  maxAmount?: string;
  amountSpent: string;
  agentDID?: string;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  /** Wallet address for the session */
  walletAddress: string;
  /** Chain type (evm or solana) */
  chain: 'evm' | 'solana';
  /** Network ID */
  network: NetworkId;
  /** Allowed operation scopes (default: ['*']) */
  scope?: SessionScope[];
  /** Session duration in seconds (default: 3600, max: 86400) */
  durationSeconds?: number;
  /** Maximum amount the session can spend (in atomic units) */
  maxAmount?: string;
  /** Signed SIWE/CAIP-122 message for verification (required by backend) */
  signedMessage: string;
  /** Signature of the message (required by backend) */
  signature: string;
}

/**
 * Session validation result
 */
export interface SessionValidation {
  valid: boolean;
  session?: WalletSession;
  hasBudget?: boolean;
  error?: string;
}

/**
 * Session Service
 *
 * Provides wallet session management for SDK clients.
 * Sessions allow skipping repeated payment flows.
 *
 * @example
 * ```typescript
 * // Create a session
 * const session = await client.sessions.create({
 *   walletAddress: '0x...',
 *   chain: 'evm',
 *   network: 'base-sepolia',
 *   signedMessage: signedSIWE,
 *   signature: walletSig,
 *   durationSeconds: 3600,
 *   maxAmount: '10000000', // 10 USDC
 * });
 *
 * // Use session ID in subsequent requests
 * // The session will be validated automatically
 * ```
 */
export class SessionService {
  private readonly client: XacheClient;
  private currentSessionId: string | null = null;

  constructor(client: XacheClient) {
    this.client = client;
  }

  /**
   * Create a new wallet session
   *
   * @example
   * ```typescript
   * const session = await client.sessions.create({
   *   walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   chain: 'evm',
   *   network: 'base-sepolia',
   *   signedMessage: signedSIWE,
   *   signature: walletSig,
   *   scope: ['memory:store', 'memory:retrieve'],
   *   durationSeconds: 3600, // 1 hour
   *   maxAmount: '5000000', // 5 USDC
   * });
   *
   * console.log(`Session created: ${session.sessionId}`);
   * console.log(`Expires at: ${new Date(session.expiresAt)}`);
   * ```
   */
  async create(options: CreateSessionOptions): Promise<WalletSession> {
    const config = this.client.getConfig();

    const body = {
      walletAddress: options.walletAddress,
      chain: options.chain,
      network: options.network,
      scope: options.scope || ['*'],
      durationSeconds: options.durationSeconds,
      maxAmount: options.maxAmount,
      signedMessage: options.signedMessage,
      signature: options.signature,
      agentDID: config.did,
    };

    const response = await this.client.request<{ session: WalletSession }>(
      'POST',
      '/v1/sessions',
      body,
    );

    if (!response.success || !response.data?.session) {
      throw new Error(response.error?.message || 'Failed to create session');
    }

    return response.data.session;
  }

  /**
   * Get a session by ID
   * @param sessionId - The session ID
   * @param walletAddress - The wallet address that owns the session (required for routing)
   */
  async get(sessionId: string, walletAddress: string): Promise<WalletSession | null> {
    const response = await this.client.request<{ session: WalletSession }>(
      'GET',
      `/v1/sessions/${sessionId}?wallet=${encodeURIComponent(walletAddress)}`,
      undefined,
    );

    if (!response.success) {
      if (response.error?.code === 'NOT_FOUND') {
        return null;
      }
      throw new Error(response.error?.message || 'Failed to get session');
    }

    return response.data?.session || null;
  }

  /**
   * List all sessions for a wallet address
   */
  async listByWallet(walletAddress: string): Promise<WalletSession[]> {
    const response = await this.client.request<{ sessions: WalletSession[] }>(
      'GET',
      `/v1/sessions/wallet/${walletAddress}`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to list sessions');
    }

    return response.data?.sessions || [];
  }

  /**
   * Revoke a session
   * @param sessionId - The session ID
   * @param walletAddress - The wallet address that owns the session (required for routing)
   */
  async revoke(sessionId: string, walletAddress: string): Promise<void> {
    const response = await this.client.request<{ success: boolean }>(
      'DELETE',
      `/v1/sessions/${sessionId}?wallet=${encodeURIComponent(walletAddress)}`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to revoke session');
    }

    // Clear current session if it's the one being revoked
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /**
   * Validate a session for a specific operation
   *
   * @param sessionId - The session ID
   * @param walletAddress - The wallet address that owns the session (required for routing)
   * @param options - Validation options (amount, scope)
   *
   * @example
   * ```typescript
   * const validation = await client.sessions.validate(sessionId, walletAddress, {
   *   amount: '1000000', // 1 USDC
   *   scope: 'memory:store',
   * });
   *
   * if (validation.valid && validation.hasBudget) {
   *   // Session is valid and has budget
   * }
   * ```
   */
  async validate(sessionId: string, walletAddress: string, options?: {
    amount?: string;
    scope?: SessionScope;
  }): Promise<SessionValidation> {
    const response = await this.client.request<SessionValidation>(
      'POST',
      `/v1/sessions/${sessionId}/validate?wallet=${encodeURIComponent(walletAddress)}`,
      options || {},
    );

    if (!response.success) {
      return {
        valid: false,
        error: response.error?.message || 'Validation failed',
      };
    }

    return response.data || { valid: false, error: 'Unknown error' };
  }

  /**
   * Set the current active session for automatic use
   * When set, the session ID will be included in payment requests
   */
  setCurrentSession(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Get the current active session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Check if there is an active session
   */
  hasActiveSession(): boolean {
    return this.currentSessionId !== null;
  }

  /**
   * Get session header for payment requests
   * @internal
   */
  getSessionHeader(): Record<string, string> {
    if (!this.currentSessionId) {
      return {};
    }
    return {
      'X-Session-Id': this.currentSessionId,
    };
  }

  /**
   * Create a session and set it as the current active session
   *
   * @example
   * ```typescript
   * // Create and activate a session in one call
   * const session = await client.sessions.createAndActivate({
   *   walletAddress: '0x...',
   *   chain: 'evm',
   *   network: 'base-sepolia',
   *   signedMessage: signedSIWE,
   *   signature: walletSig,
   * });
   *
   * // All subsequent requests will use this session
   * await client.memory.store({ data: { key: 'value' }, storageTier: 'hot' });
   * ```
   */
  async createAndActivate(options: CreateSessionOptions): Promise<WalletSession> {
    const session = await this.create(options);
    this.setCurrentSession(session.sessionId);
    return session;
  }

  /**
   * Get the remaining time in seconds for a session
   */
  getRemainingTime(session: WalletSession): number {
    const now = Date.now();
    const remaining = session.expiresAt - now;
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * Check if a session is expired
   */
  isExpired(session: WalletSession): boolean {
    return Date.now() > session.expiresAt;
  }

  /**
   * Get the remaining budget for a session
   * Returns null if session has no max amount set
   */
  getRemainingBudget(session: WalletSession): string | null {
    if (!session.maxAmount) {
      return null;
    }
    const max = BigInt(session.maxAmount);
    const spent = BigInt(session.amountSpent);
    const remaining = max - spent;
    return remaining > 0n ? remaining.toString() : '0';
  }
}
