/**
 * Type definitions for Memory Extractor
 */

import type { StandardContext } from '@xache/sdk';

/**
 * Generic LLM function interface - users provide their own implementation
 *
 * @param prompt - The prompt to send to the LLM
 * @returns The LLM's response as a string
 *
 * @example
 * ```typescript
 * const llm: LLMFunction = async (prompt) => {
 *   const response = await myLLMService.complete(prompt);
 *   return response.text;
 * };
 * ```
 */
export type LLMFunction = (prompt: string) => Promise<string>;

/**
 * LLM adapter interface for pre-built provider integrations
 */
export interface LLMAdapter {
  /**
   * Complete a prompt using the configured LLM
   */
  complete(prompt: string): Promise<string>;
}

/**
 * Configuration for MemoryExtractor
 */
export interface MemoryExtractorConfig {
  /**
   * LLM implementation - either a function or adapter
   *
   * The extractor generates prompts and parses responses.
   * You provide the LLM connectivity (API key, model choice, etc.)
   *
   * @example
   * // Bring your own function
   * llm: async (prompt) => await myModel.complete(prompt)
   *
   * @example
   * // Use pre-built adapter
   * llm: new AnthropicAdapter({ apiKey, model })
   */
  llm: LLMFunction | LLMAdapter;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Minimum confidence threshold (0.0-1.0)
   * Extractions below this score are filtered out
   * @default 0.7
   */
  confidenceThreshold?: number;
}

/**
 * Parameters for extract() method
 */
export interface ExtractParams {
  /**
   * Agent execution trace to analyze
   * Can be unstructured string or structured JSON
   */
  trace: string | object;

  /**
   * Optional domain hint to improve extraction quality
   *
   * @example 'customer-service', 'code-assistant', 'data-analysis'
   */
  agentContext?: string;

  /**
   * Override default confidence threshold for this extraction
   */
  confidenceThreshold?: number;
}

/**
 * Extracted memory recommendation
 */
export interface ExtractedMemory {
  /**
   * Memory type from StandardContexts
   */
  type: StandardContext;

  /**
   * Confidence score (0.0-1.0)
   */
  confidence: number;

  /**
   * Structured data ready for memory storage
   */
  data: Record<string, unknown>;

  /**
   * LLM's reasoning for this extraction
   */
  reasoning: string;

  /**
   * Suggested SDK helper method to use
   *
   * @example 'rememberPreference', 'rememberFix', 'rememberPattern'
   */
  suggestedMethod: string;

  /**
   * Evidence from trace supporting this extraction
   */
  evidence?: string;
}

/**
 * Raw extraction result from LLM (before parsing)
 */
export interface RawExtraction {
  type: string;
  confidence: number;
  data: Record<string, unknown>;
  reasoning: string;
  evidence?: string;
}

/**
 * Trace format types
 */
export type TraceFormat = 'string' | 'json' | 'auto';

// ============================================================
// Graph Extraction Types
// ============================================================

/**
 * Configuration for GraphExtractor
 */
export interface GraphExtractorConfig {
  /** LLM implementation - either a function or adapter */
  llm: LLMFunction | LLMAdapter;
  /** Enable debug logging */
  debug?: boolean;
  /** Minimum confidence threshold (0.0-1.0) */
  confidenceThreshold?: number;
}

/**
 * Parameters for graph extraction
 */
export interface GraphExtractParams {
  /** Agent execution trace to analyze */
  trace: string | object;
  /** Known entities for resolution (decrypted, from SDK) */
  knownEntities: Array<{
    key: string;
    type: string;
    name: string;
    summary: string;
    attributes?: Record<string, unknown>;
  }>;
  /** Optional domain hint */
  contextHint?: string;
  /** Override confidence threshold */
  confidenceThreshold?: number;
}

/**
 * Raw graph extraction from LLM (validated but not processed)
 */
export interface RawGraphExtractionResult {
  entities: Array<{
    key: string;
    type: string;
    name: string;
    summary: string;
    attributes: Record<string, unknown>;
    confidence: number;
    evidence?: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    description: string;
    attributes: Record<string, unknown>;
    confidence: number;
    evidence?: string;
  }>;
  temporalUpdates: Array<{
    entityKey: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    effectiveDate: string;
    evidence?: string;
  }>;
}
