/**
 * Ephemeral Context Service
 *
 * Manages ephemeral working memory sessions — short-lived, slot-based
 * scratch space that agents can use during a task and optionally promote
 * to persistent memory.
 */

import type { XacheClient } from '../XacheClient';

// =============================================================================
// Types
// =============================================================================

export type EphemeralSlotName = 'conversation' | 'facts' | 'tasks' | 'cache' | 'scratch' | 'handoff';

export interface CreateEphemeralSessionOptions {
  ttlSeconds?: number;    // default 3600
  maxWindows?: number;    // default 5
  metadata?: Record<string, unknown>;
}

export interface EphemeralSession {
  sessionKey: string;
  agentDID: string;
  status: 'active' | 'expired' | 'promoted' | 'terminated';
  window: number;
  maxWindows: number;
  ttlSeconds: number;
  createdAt: string;
  expiresAt: string;
  cumulativeCost: number;
  activeSlots: string[];
  totalSize: number;
}

export interface PromoteResult {
  memoriesCreated: number;
  memoryIds: string[];
  receiptId?: string;
}

export interface EphemeralStructuredView {
  sessionKey: string;
  entities: Array<{ name: string; type: string; confidence: number }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  summary: string;
}

export interface EphemeralStats {
  activeSessions: number;
  totalSessions: number;
  todaySpend: number;
  avgDurationMinutes: number;
  promoteRate: number;
  totalPromoted: number;
}

export interface ListEphemeralSessionsParams {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedEphemeralSessions {
  sessions: EphemeralSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// Service
// =============================================================================

/**
 * Ephemeral Context Service
 *
 * Provides ephemeral working memory sessions for agents.
 * Sessions are short-lived, slot-based scratch spaces that can be
 * promoted to persistent memory when the task is complete.
 *
 * @example
 * ```typescript
 * // Create ephemeral session
 * const session = await client.ephemeral.createSession({ ttlSeconds: 1800 });
 *
 * // Write to a slot
 * await client.ephemeral.writeSlot(session.sessionKey, 'facts', {
 *   userName: 'Alice',
 *   preference: 'dark mode',
 * });
 *
 * // Read from a slot
 * const facts = await client.ephemeral.readSlot(session.sessionKey, 'facts');
 *
 * // Promote to persistent memory
 * const result = await client.ephemeral.promoteSession(session.sessionKey);
 * console.log(`Created ${result.memoriesCreated} memories`);
 * ```
 */
export class EphemeralService {
  private readonly client: XacheClient;

  constructor(client: XacheClient) {
    this.client = client;
  }

  // =========================================================================
  // Session Lifecycle
  // =========================================================================

  /**
   * Create a new ephemeral session (x402 payment)
   */
  async createSession(options: CreateEphemeralSessionOptions = {}): Promise<EphemeralSession> {
    const body: Record<string, unknown> = {};
    if (options.ttlSeconds !== undefined) body.ttlSeconds = options.ttlSeconds;
    if (options.maxWindows !== undefined) body.maxWindows = options.maxWindows;
    if (options.metadata !== undefined) body.metadata = options.metadata;

    const response = await this.client.request<EphemeralSession>(
      'POST',
      '/v1/ephemeral/sessions',
      body,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create ephemeral session');
    }

    return response.data;
  }

  /**
   * Get an ephemeral session by key
   */
  async getSession(sessionKey: string): Promise<EphemeralSession | null> {
    const response = await this.client.request<EphemeralSession>(
      'GET',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}`,
    );

    if (!response.success) {
      if (response.error?.code === 'NOT_FOUND') {
        return null;
      }
      throw new Error(response.error?.message || 'Failed to get ephemeral session');
    }

    return response.data || null;
  }

  /**
   * Renew an ephemeral session (extends TTL)
   */
  async renewSession(sessionKey: string): Promise<EphemeralSession> {
    const response = await this.client.request<EphemeralSession>(
      'POST',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/renew`,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to renew ephemeral session');
    }

    return response.data;
  }

  /**
   * Promote an ephemeral session to persistent memory
   */
  async promoteSession(sessionKey: string): Promise<PromoteResult> {
    const response = await this.client.request<PromoteResult>(
      'POST',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/promote`,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to promote ephemeral session');
    }

    return response.data;
  }

  /**
   * Terminate an ephemeral session
   */
  async terminateSession(sessionKey: string): Promise<void> {
    const response = await this.client.request<{ success: boolean }>(
      'DELETE',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}`,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to terminate ephemeral session');
    }
  }

  // =========================================================================
  // Slot CRUD
  // =========================================================================

  /**
   * Write data to a slot
   */
  async writeSlot(sessionKey: string, slot: EphemeralSlotName, data: Record<string, unknown>): Promise<void> {
    const response = await this.client.request<{ success: boolean }>(
      'PUT',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/slots/${slot}`,
      { data },
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to write ephemeral slot');
    }
  }

  /**
   * Read data from a slot
   */
  async readSlot(sessionKey: string, slot: EphemeralSlotName): Promise<Record<string, unknown>> {
    const response = await this.client.request<Record<string, unknown>>(
      'GET',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/slots/${slot}`,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to read ephemeral slot');
    }

    return response.data || {};
  }

  /**
   * Read all slots for a session
   */
  async readAllSlots(sessionKey: string): Promise<Record<EphemeralSlotName, Record<string, unknown>>> {
    const response = await this.client.request<Record<EphemeralSlotName, Record<string, unknown>>>(
      'GET',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/slots`,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to read ephemeral slots');
    }

    return response.data || {} as Record<EphemeralSlotName, Record<string, unknown>>;
  }

  /**
   * Clear a slot
   */
  async clearSlot(sessionKey: string, slot: EphemeralSlotName): Promise<void> {
    const response = await this.client.request<{ success: boolean }>(
      'DELETE',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/slots/${slot}`,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to clear ephemeral slot');
    }
  }

  // =========================================================================
  // Structured View + Export
  // =========================================================================

  /**
   * Get structured view of an ephemeral session
   */
  async getStructured(sessionKey: string): Promise<EphemeralStructuredView> {
    const response = await this.client.request<EphemeralStructuredView>(
      'GET',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/structured`,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get structured view');
    }

    return response.data;
  }

  /**
   * Export an ephemeral session
   */
  async exportSession(sessionKey: string, format: 'json' | 'markdown' | 'audit' = 'json'): Promise<any> {
    const response = await this.client.request<any>(
      'GET',
      `/v1/ephemeral/sessions/${encodeURIComponent(sessionKey)}/export?format=${format}`,
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to export ephemeral session');
    }

    return response.data;
  }

  // =========================================================================
  // Convenience
  // =========================================================================

  /**
   * List ephemeral sessions
   */
  async listSessions(params?: ListEphemeralSessionsParams): Promise<PaginatedEphemeralSessions> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));

    const qs = query.toString();
    const path = `/v1/ephemeral/sessions${qs ? `?${qs}` : ''}`;

    const response = await this.client.request<PaginatedEphemeralSessions>(
      'GET',
      path,
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to list ephemeral sessions');
    }

    return response.data;
  }

  /**
   * Get ephemeral stats
   */
  async getStats(): Promise<EphemeralStats> {
    const response = await this.client.request<EphemeralStats>(
      'GET',
      '/v1/ephemeral/stats',
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get ephemeral stats');
    }

    return response.data;
  }
}
