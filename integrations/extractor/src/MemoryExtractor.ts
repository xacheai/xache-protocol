/**
 * MemoryExtractor - LLM-agnostic trace analysis and memory extraction
 */

import { StandardContexts } from '@xache/sdk';
import type {
  MemoryExtractorConfig,
  ExtractParams,
  ExtractedMemory,
  LLMAdapter,
  LLMFunction,
  RawExtraction,
} from './types';
import { buildExtractionPrompt } from './prompts/templates';
import { normalizeTrace, parseExtractionResponse, isValidExtraction } from './parsers';

/**
 * Mapping from context type to SDK helper method
 */
const CONTEXT_TO_METHOD: Record<string, string> = {
  [StandardContexts.USER_PREFERENCE]: 'rememberPreference',
  [StandardContexts.ERROR_FIX]: 'rememberFix',
  [StandardContexts.SUCCESSFUL_PATTERN]: 'rememberPattern',
  [StandardContexts.FAILED_APPROACH]: 'rememberPattern',
  [StandardContexts.TOOL_CONFIG]: 'rememberToolConfig',
  [StandardContexts.CONVERSATION_SUMMARY]: 'rememberConversation',
  [StandardContexts.DOMAIN_HEURISTIC]: 'rememberHeuristic',
  [StandardContexts.OPTIMIZATION_INSIGHT]: 'rememberOptimization',
};

/**
 * MemoryExtractor analyzes agent execution traces and extracts learnings
 *
 * This is an LLM-agnostic tool - you provide the LLM, we provide the prompts.
 *
 * @example
 * ```typescript
 * import { MemoryExtractor, AnthropicAdapter } from '@xache/extractor';
 *
 * const extractor = new MemoryExtractor({
 *   llm: new AnthropicAdapter({
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *     model: 'claude-3-5-sonnet-20241022'
 *   })
 * });
 *
 * const extractions = await extractor.extract({
 *   trace: executionLog,
 *   agentContext: 'customer-service'
 * });
 *
 * // Store high-confidence learnings
 * for (const ex of extractions) {
 *   if (ex.confidence > 0.8) {
 *     await client.memory[ex.suggestedMethod](ex.data);
 *   }
 * }
 * ```
 */
export class MemoryExtractor {
  private readonly llm: LLMFunction;
  private readonly debug: boolean;
  private readonly defaultConfidenceThreshold: number;

  constructor(config: MemoryExtractorConfig) {
    // Normalize LLM to function interface
    if (typeof config.llm === 'function') {
      this.llm = config.llm;
    } else {
      // It's an adapter
      const adapter = config.llm as LLMAdapter;
      this.llm = async (prompt: string) => adapter.complete(prompt);
    }

    this.debug = config.debug ?? false;
    this.defaultConfidenceThreshold = config.confidenceThreshold ?? 0.7;
  }

  /**
   * Extract learnings from an agent execution trace
   *
   * @param params - Extraction parameters
   * @returns Array of extracted memories with confidence scores
   *
   * @example
   * ```typescript
   * const extractions = await extractor.extract({
   *   trace: `
   *     User: I need help with my order
   *     Agent: Checking order #12345...
   *     Agent: Found issue - payment declined
   *     User: Can you retry?
   *     Agent: Retried payment, successful
   *   `,
   *   agentContext: 'customer-service'
   * });
   * ```
   */
  async extract(params: ExtractParams): Promise<ExtractedMemory[]> {
    const { trace, agentContext, confidenceThreshold } = params;

    // Normalize trace to string
    const normalizedTrace = normalizeTrace(trace);

    if (this.debug) {
      console.log('[MemoryExtractor] Normalized trace:', normalizedTrace.substring(0, 200) + '...');
    }

    // Build extraction prompt
    const prompt = buildExtractionPrompt(normalizedTrace, agentContext);

    if (this.debug) {
      console.log('[MemoryExtractor] Generated prompt:', prompt.substring(0, 300) + '...');
    }

    // Call user's LLM
    const llmResponse = await this.llm(prompt);

    if (this.debug) {
      console.log('[MemoryExtractor] LLM response:', llmResponse.substring(0, 500) + '...');
    }

    // Parse response
    const rawExtractions = parseExtractionResponse(llmResponse);

    if (this.debug) {
      console.log('[MemoryExtractor] Parsed extractions:', rawExtractions.length);
    }

    // Validate and transform extractions
    const threshold = confidenceThreshold ?? this.defaultConfidenceThreshold;
    const validExtractions = rawExtractions
      .filter(isValidExtraction)
      .filter((ex) => ex.confidence >= threshold)
      .map((raw: RawExtraction) => this.transformExtraction(raw));

    if (this.debug) {
      console.log(
        `[MemoryExtractor] Valid extractions after filtering (threshold=${threshold}):`,
        validExtractions.length
      );
    }

    return validExtractions;
  }

  /**
   * Transform raw extraction to ExtractedMemory
   * @private
   */
  private transformExtraction(raw: RawExtraction): ExtractedMemory {
    const suggestedMethod = CONTEXT_TO_METHOD[raw.type] || 'store';

    return {
      type: raw.type as any, // Type is validated by LLM
      confidence: raw.confidence,
      data: raw.data,
      reasoning: raw.reasoning,
      suggestedMethod,
      evidence: raw.evidence,
    };
  }

  /**
   * Batch extract from multiple traces
   *
   * @param traces - Array of traces to process
   * @returns Array of extraction results (one per trace)
   *
   * @example
   * ```typescript
   * const results = await extractor.batchExtract([
   *   { trace: trace1, agentContext: 'support' },
   *   { trace: trace2, agentContext: 'support' },
   *   { trace: trace3, agentContext: 'support' },
   * ]);
   * ```
   */
  async batchExtract(traces: ExtractParams[]): Promise<ExtractedMemory[][]> {
    // Process in parallel for better performance
    return Promise.all(traces.map((params) => this.extract(params)));
  }
}
