/**
 * Memory Helper Methods (SDK Sugar)
 *
 * High-level, opinionated helpers for common memory operations.
 * These methods use StandardContexts and provide agent-friendly abstractions.
 *
 * Philosophy: Guide agents toward best practices without enforcing restrictions.
 */

import type { MemoryService } from './MemoryService';
import { StandardContexts } from '../constants/StandardContexts';

export interface UserPreference {
  key: string;
  value: unknown;
  userId?: string;
  timestamp?: number;
}

export interface ErrorFix {
  error: string;
  solution: string;
  context?: string;
  timestamp?: number;
}

export interface Pattern {
  pattern: string;
  success: boolean;
  domain?: string;
  confidence?: number;
  timestamp?: number;
}

export interface ConversationSummary {
  summary: string;
  turns: number;
  startTime: number;
  endTime?: number;
  participants?: string[];
}

export interface ToolConfig {
  toolName: string;
  config: Record<string, unknown>;
  version?: string;
  timestamp?: number;
}

export interface DomainHeuristic {
  domain: string;
  heuristic: string;
  confidence: number;
  evidence?: string;
  timestamp?: number;
}

export interface OptimizationInsight {
  operation: string;
  improvement: string;
  metrics?: Record<string, number>;
  timestamp?: number;
}

export interface Memory {
  storageKey: string;
  data: Record<string, unknown>;
  storageTier: string;
  metadata?: Record<string, unknown>;
  receiptId: string;
}

export class MemoryHelpers {
  constructor(private readonly memoryService: MemoryService) {}

  /**
   * Remember a user preference
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberPreference({
   *   key: 'responseStyle',
   *   value: 'concise',
   *   userId: 'user_123'
   * });
   * ```
   */
  async rememberPreference(pref: UserPreference): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        key: pref.key,
        value: pref.value,
        userId: pref.userId,
        timestamp: pref.timestamp || Date.now(),
      },
      storageTier: 'hot',
      context: StandardContexts.USER_PREFERENCE,
      tags: ['preference', pref.key],
      metadata: {
        preferenceKey: pref.key,
        userId: pref.userId,
      },
    });

    return result.storageKey;
  }

  /**
   * Remember an error fix
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberFix({
   *   error: 'TypeError: undefined is not a function',
   *   solution: 'Added optional chaining operator',
   *   context: 'payment-handler'
   * });
   * ```
   */
  async rememberFix(fix: ErrorFix): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        error: fix.error,
        solution: fix.solution,
        context: fix.context,
        timestamp: fix.timestamp || Date.now(),
      },
      storageTier: 'warm',
      context: StandardContexts.ERROR_FIX,
      tags: ['error', 'fix'],
      metadata: {
        errorType: this.extractErrorType(fix.error),
      },
    });

    return result.storageKey;
  }

  /**
   * Remember a pattern (successful or failed)
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberPattern({
   *   pattern: 'Use exponential backoff for API retries',
   *   success: true,
   *   domain: 'api-resilience',
   *   confidence: 0.95
   * });
   * ```
   */
  async rememberPattern(pattern: Pattern): Promise<string> {
    const context = pattern.success
      ? StandardContexts.SUCCESSFUL_PATTERN
      : StandardContexts.FAILED_APPROACH;

    const result = await this.memoryService.store({
      data: {
        pattern: pattern.pattern,
        success: pattern.success,
        domain: pattern.domain,
        confidence: pattern.confidence,
        timestamp: pattern.timestamp || Date.now(),
      },
      storageTier: 'warm',
      context,
      tags: ['pattern', pattern.success ? 'success' : 'failure', pattern.domain].filter(Boolean) as string[],
      metadata: {
        domain: pattern.domain,
        confidence: pattern.confidence,
      },
    });

    return result.storageKey;
  }

  /**
   * Remember a conversation summary
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberConversation({
   *   summary: 'User asked about restaurant recommendations, I suggested 3 options',
   *   turns: 5,
   *   startTime: Date.now() - 300000,
   *   endTime: Date.now()
   * });
   * ```
   */
  async rememberConversation(conv: ConversationSummary): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        summary: conv.summary,
        turns: conv.turns,
        startTime: conv.startTime,
        endTime: conv.endTime || Date.now(),
        participants: conv.participants,
      },
      storageTier: 'hot',
      context: StandardContexts.CONVERSATION_SUMMARY,
      tags: ['conversation', `turns:${conv.turns}`],
      metadata: {
        turnCount: conv.turns,
        duration: (conv.endTime || Date.now()) - conv.startTime,
      },
    });

    return result.storageKey;
  }

  /**
   * Remember a tool configuration
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberToolConfig({
   *   toolName: 'weatherAPI',
   *   config: { apiKey: 'xxx', units: 'metric' },
   *   version: '2.0'
   * });
   * ```
   */
  async rememberToolConfig(tool: ToolConfig): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        toolName: tool.toolName,
        config: tool.config,
        version: tool.version,
        timestamp: tool.timestamp || Date.now(),
      },
      storageTier: 'warm',
      context: StandardContexts.TOOL_CONFIG,
      tags: ['tool', tool.toolName],
      metadata: {
        toolName: tool.toolName,
        version: tool.version,
      },
    });

    return result.storageKey;
  }

  /**
   * Remember a domain-specific heuristic
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberHeuristic({
   *   domain: 'code-review',
   *   heuristic: 'Functions over 50 lines should be refactored',
   *   confidence: 0.85,
   *   evidence: 'Based on 100+ code reviews'
   * });
   * ```
   */
  async rememberHeuristic(heuristic: DomainHeuristic): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        domain: heuristic.domain,
        heuristic: heuristic.heuristic,
        confidence: heuristic.confidence,
        evidence: heuristic.evidence,
        timestamp: heuristic.timestamp || Date.now(),
      },
      storageTier: 'cold',
      context: StandardContexts.DOMAIN_HEURISTIC,
      tags: ['heuristic', heuristic.domain],
      metadata: {
        domain: heuristic.domain,
        confidence: heuristic.confidence,
      },
    });

    return result.storageKey;
  }

  /**
   * Remember an optimization insight
   *
   * @example
   * ```typescript
   * const storageKey = await client.memory.rememberOptimization({
   *   operation: 'database-query',
   *   improvement: 'Added index on user_id column',
   *   metrics: { before: 2500, after: 150, unit: 'ms' }
   * });
   * ```
   */
  async rememberOptimization(insight: OptimizationInsight): Promise<string> {
    const result = await this.memoryService.store({
      data: {
        operation: insight.operation,
        improvement: insight.improvement,
        metrics: insight.metrics,
        timestamp: insight.timestamp || Date.now(),
      },
      storageTier: 'warm',
      context: StandardContexts.OPTIMIZATION_INSIGHT,
      tags: ['optimization', insight.operation],
      metadata: {
        operation: insight.operation,
        metrics: insight.metrics,
      },
    });

    return result.storageKey;
  }

  /**
   * Recall all user preferences
   *
   * @example
   * ```typescript
   * const prefs = await client.memory.recallPreferences({ limit: 50 });
   * for (const pref of prefs) {
   *   console.log(pref.data.key, pref.data.value);
   * }
   * ```
   */
  async recallPreferences(opts?: { limit?: number }): Promise<Memory[]> {
    const result = await this.memoryService.list({
      context: StandardContexts.USER_PREFERENCE,
      limit: opts?.limit || 50,
    });

    // List returns metadata, not decrypted data - retrieve each memory
    const memories: Memory[] = [];
    for (const item of result.memories || []) {
      try {
        const retrieved = await this.memoryService.retrieve({ storageKey: item.storage_key });
        memories.push({
          storageKey: retrieved.storageKey,
          data: retrieved.data as Record<string, unknown>,
          storageTier: retrieved.storageTier,
          metadata: retrieved.metadata,
          receiptId: retrieved.receiptId,
        });
      } catch {
        // Skip failed retrievals
      }
    }
    return memories;
  }

  /**
   * Recall error fixes
   *
   * @example
   * ```typescript
   * const fixes = await client.memory.recallFixes({ domain: 'api-errors' });
   * ```
   */
  async recallFixes(opts?: { domain?: string; limit?: number }): Promise<Memory[]> {
    const result = await this.memoryService.list({
      context: StandardContexts.ERROR_FIX,
      limit: opts?.limit || 50,
    });

    const memories: Memory[] = [];
    for (const item of result.memories || []) {
      try {
        const retrieved = await this.memoryService.retrieve({ storageKey: item.storage_key });
        // Filter by domain if specified
        if (opts?.domain && (retrieved.data as any)?.context !== opts.domain) {
          continue;
        }
        memories.push({
          storageKey: retrieved.storageKey,
          data: retrieved.data as Record<string, unknown>,
          storageTier: retrieved.storageTier,
          metadata: retrieved.metadata,
          receiptId: retrieved.receiptId,
        });
      } catch {
        // Skip failed retrievals
      }
    }
    return memories;
  }

  /**
   * Recall patterns
   *
   * @example
   * ```typescript
   * const successPatterns = await client.memory.recallPatterns({ success: true });
   * ```
   */
  async recallPatterns(opts?: { success?: boolean; limit?: number }): Promise<Memory[]> {
    // Query both success and failure contexts based on filter
    const context = opts?.success === true
      ? StandardContexts.SUCCESSFUL_PATTERN
      : opts?.success === false
        ? StandardContexts.FAILED_APPROACH
        : undefined;

    const result = await this.memoryService.list({
      context,
      limit: opts?.limit || 50,
    });

    const memories: Memory[] = [];
    for (const item of result.memories || []) {
      try {
        const retrieved = await this.memoryService.retrieve({ storageKey: item.storage_key });
        memories.push({
          storageKey: retrieved.storageKey,
          data: retrieved.data as Record<string, unknown>,
          storageTier: retrieved.storageTier,
          metadata: retrieved.metadata,
          receiptId: retrieved.receiptId,
        });
      } catch {
        // Skip failed retrievals
      }
    }
    return memories;
  }

  /**
   * Extract error type from error message
   * @private
   */
  private extractErrorType(error: string): string {
    const match = error.match(/^(\w+Error):/);
    return match ? match[1] : 'UnknownError';
  }
}
