/**
 * Standard Memory Context Conventions (SDK Layer)
 *
 * These are SDK conventions, NOT protocol requirements.
 * The protocol treats context as an opaque string.
 *
 * Agents can use custom contexts (e.g., 'mycompany.custom.type').
 * These standard contexts promote interoperability across the ecosystem.
 */

export const StandardContexts = {
  /** User settings and preferences */
  USER_PREFERENCE: 'xache.user.preference',

  /** Error-to-solution mappings */
  ERROR_FIX: 'xache.error.fix',

  /** Successful patterns and approaches */
  SUCCESSFUL_PATTERN: 'xache.pattern.success',

  /** Failed approaches to avoid */
  FAILED_APPROACH: 'xache.pattern.failure',

  /** Tool configurations and settings */
  TOOL_CONFIG: 'xache.tool.config',

  /** Conversation summaries (multi-turn) */
  CONVERSATION_SUMMARY: 'xache.conversation.summary',

  /** Domain-specific heuristics and insights */
  DOMAIN_HEURISTIC: 'xache.domain.heuristic',

  /** Performance optimization insights */
  OPTIMIZATION_INSIGHT: 'xache.optimization.insight',

  /** Knowledge graph entity */
  GRAPH_ENTITY: 'xache.graph.entity',

  /** Knowledge graph relationship */
  GRAPH_RELATIONSHIP: 'xache.graph.relationship',
} as const;

export type StandardContext = typeof StandardContexts[keyof typeof StandardContexts];
