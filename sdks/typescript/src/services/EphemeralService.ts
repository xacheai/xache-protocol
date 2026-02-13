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

export interface AutoProbeConfig {
  enabled: boolean;
  intervalSeconds?: number;  // default 60, min 30, max 300
  maxResults?: number;       // default 5, max 20
  scope?: { subjectId?: string; scope?: string; includeGlobal?: boolean };
}

export interface CreateEphemeralSessionOptions {
  ttlSeconds?: number;    // default 3600
  maxWindows?: number;    // default 5
  metadata?: Record<string, unknown>;
  autoProbe?: AutoProbeConfig;
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
  slotSizes: Record<string, number>;
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
  private readonly autoProbeTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly autoProbeSeen = new Map<string, Set<string>>();

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

    const session = response.data;

    // Start auto-probe timer if configured
    if (options.autoProbe?.enabled) {
      this.startAutoProbe(session.sessionKey, options.autoProbe);
    }

    return session;
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
    this.stopAutoProbe(sessionKey);

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

  // =========================================================================
  // Auto-Probe
  // =========================================================================

  /**
   * Start auto-probe timer for a session.
   * Reads conversation + facts slots, generates a probe, writes results to cache slot.
   */
  private startAutoProbe(sessionKey: string, config: AutoProbeConfig): void {
    const intervalMs = Math.max(30, Math.min(300, config.intervalSeconds || 60)) * 1000;
    const maxResults = Math.max(1, Math.min(20, config.maxResults || 5));

    this.autoProbeSeen.set(sessionKey, new Set());

    const timer = setInterval(async () => {
      try {
        await this.runAutoProbe(sessionKey, maxResults, config.scope);
      } catch {
        // Best-effort — don't crash the session on probe failure
      }
    }, intervalMs);

    this.autoProbeTimers.set(sessionKey, timer);
  }

  /**
   * Stop auto-probe timer for a session.
   */
  private stopAutoProbe(sessionKey: string): void {
    const timer = this.autoProbeTimers.get(sessionKey);
    if (timer) {
      clearInterval(timer);
      this.autoProbeTimers.delete(sessionKey);
    }
    this.autoProbeSeen.delete(sessionKey);
  }

  /**
   * Run a single auto-probe cycle: read slots → probe → write cache.
   */
  private async runAutoProbe(
    sessionKey: string,
    maxResults: number,
    scope?: { subjectId?: string; scope?: string; includeGlobal?: boolean },
  ): Promise<void> {
    // Read conversation + facts slots to build probe query
    const [conversation, facts] = await Promise.all([
      this.readSlot(sessionKey, 'conversation').catch(() => ({})),
      this.readSlot(sessionKey, 'facts').catch(() => ({})),
    ]);

    const parts: string[] = [];
    if (conversation && Object.keys(conversation).length > 0) {
      parts.push(JSON.stringify(conversation));
    }
    if (facts && Object.keys(facts).length > 0) {
      parts.push(JSON.stringify(facts));
    }

    if (parts.length === 0) return;

    const query = parts.join(' ');

    // Probe for relevant memories
    const probeResult = await this.client.memory.probe({
      query,
      limit: maxResults,
      scope,
    });

    if (!probeResult.matches.length) return;

    // Deduplicate against already-cached memories
    const seen = this.autoProbeSeen.get(sessionKey) || new Set();
    const newMatches = probeResult.matches.filter(m => !seen.has(m.storageKey));

    if (newMatches.length === 0) return;

    for (const m of newMatches) {
      seen.add(m.storageKey);
    }

    // Write new matches to cache slot (merge with existing)
    const existingCache = await this.readSlot(sessionKey, 'cache').catch(() => ({}));
    const cachedMemories = (existingCache as any)?.autoProbeResults || [];
    const updated = [
      ...cachedMemories,
      ...newMatches.map(m => ({
        storageKey: m.storageKey,
        category: m.category,
        data: m.data,
        probedAt: new Date().toISOString(),
      })),
    ];

    await this.writeSlot(sessionKey, 'cache', {
      ...(existingCache || {}),
      autoProbeResults: updated,
    });
  }
}
