/**
 * GraphExtractor - LLM-agnostic entity and relationship extraction
 *
 * Follows the same pattern as MemoryExtractor but extracts entities,
 * relationships, and temporal updates instead of flat learnings.
 */

import type {
  GraphExtractorConfig,
  GraphExtractParams,
  RawGraphExtractionResult,
  LLMAdapter,
  LLMFunction,
} from './types';
import { buildGraphExtractionPrompt, formatKnownEntities } from './prompts/graph-templates';
import { normalizeTrace } from './parsers';

/**
 * GraphExtractor analyzes agent execution traces and extracts
 * entities, relationships, and temporal changes.
 *
 * @example
 * ```typescript
 * import { GraphExtractor, AnthropicAdapter } from '@xache/extractor';
 *
 * const extractor = new GraphExtractor({
 *   llm: new AnthropicAdapter({ apiKey, model: 'claude-sonnet-4-20250514' }),
 * });
 *
 * const result = await extractor.extract({
 *   trace: agentTrace,
 *   knownEntities: existingEntities,
 *   contextHint: 'customer-support',
 * });
 * ```
 */
export class GraphExtractor {
  private readonly llm: LLMFunction;
  private readonly debug: boolean;
  private readonly defaultConfidenceThreshold: number;

  constructor(config: GraphExtractorConfig) {
    if (typeof config.llm === 'function') {
      this.llm = config.llm;
    } else {
      const adapter = config.llm as LLMAdapter;
      this.llm = async (prompt: string) => adapter.complete(prompt);
    }

    this.debug = config.debug ?? false;
    this.defaultConfidenceThreshold = config.confidenceThreshold ?? 0.5;
  }

  /**
   * Extract entities and relationships from an agent execution trace.
   */
  async extract(params: GraphExtractParams): Promise<RawGraphExtractionResult> {
    const { trace, knownEntities, contextHint, confidenceThreshold } = params;

    // Normalize trace to string
    const normalizedTrace = normalizeTrace(trace);

    if (this.debug) {
      console.log('[GraphExtractor] Trace length:', normalizedTrace.length);
      console.log('[GraphExtractor] Known entities:', knownEntities.length);
    }

    // Format known entities for the prompt
    const knownEntitiesStr = formatKnownEntities(knownEntities);

    // Build extraction prompt
    const prompt = buildGraphExtractionPrompt(normalizedTrace, knownEntitiesStr, contextHint);

    if (this.debug) {
      console.log('[GraphExtractor] Prompt length:', prompt.length);
    }

    // Call LLM
    const llmResponse = await this.llm(prompt);

    if (this.debug) {
      console.log('[GraphExtractor] LLM response:', llmResponse.substring(0, 500));
    }

    // Parse response
    const parsed = this.parseResponse(llmResponse);

    // Filter by confidence threshold
    const threshold = confidenceThreshold ?? this.defaultConfidenceThreshold;

    const result: RawGraphExtractionResult = {
      entities: parsed.entities.filter((e) => e.confidence >= threshold),
      relationships: parsed.relationships.filter((r) => r.confidence >= threshold),
      temporalUpdates: parsed.temporalUpdates,
    };

    if (this.debug) {
      console.log(
        `[GraphExtractor] Extracted: ${result.entities.length} entities, ` +
        `${result.relationships.length} relationships, ` +
        `${result.temporalUpdates.length} temporal updates`
      );
    }

    return result;
  }

  /**
   * Parse and validate the LLM response JSON.
   */
  private parseResponse(response: string): RawGraphExtractionResult {
    const empty: RawGraphExtractionResult = {
      entities: [],
      relationships: [],
      temporalUpdates: [],
    };

    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Remove markdown fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // Find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      if (this.debug) {
        console.warn('[GraphExtractor] No JSON object found in response');
      }
      return empty;
    }

    try {
      const parsed = JSON.parse(objectMatch[0]);

      return {
        entities: Array.isArray(parsed.entities)
          ? parsed.entities.filter(this.isValidEntity)
          : [],
        relationships: Array.isArray(parsed.relationships)
          ? parsed.relationships.filter(this.isValidRelationship)
          : [],
        temporalUpdates: Array.isArray(parsed.temporalUpdates)
          ? parsed.temporalUpdates.filter(this.isValidTemporalUpdate)
          : [],
      };
    } catch (error) {
      if (this.debug) {
        console.error('[GraphExtractor] JSON parse error:', error);
      }
      return empty;
    }
  }

  private isValidEntity(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    const entity = e as Record<string, unknown>;
    return (
      typeof entity.key === 'string' &&
      typeof entity.type === 'string' &&
      typeof entity.name === 'string' &&
      typeof entity.summary === 'string' &&
      typeof entity.confidence === 'number' &&
      entity.confidence >= 0 &&
      entity.confidence <= 1
    );
  }

  private isValidRelationship(r: unknown): boolean {
    if (!r || typeof r !== 'object') return false;
    const rel = r as Record<string, unknown>;
    return (
      typeof rel.from === 'string' &&
      typeof rel.to === 'string' &&
      typeof rel.type === 'string' &&
      typeof rel.description === 'string' &&
      typeof rel.confidence === 'number' &&
      rel.confidence >= 0 &&
      rel.confidence <= 1
    );
  }

  private isValidTemporalUpdate(t: unknown): boolean {
    if (!t || typeof t !== 'object') return false;
    const update = t as Record<string, unknown>;
    return (
      typeof update.entityKey === 'string' &&
      typeof update.field === 'string' &&
      typeof update.effectiveDate === 'string'
    );
  }
}
