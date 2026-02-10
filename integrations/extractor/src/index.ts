/**
 * @xache/extractor - LLM-agnostic memory extraction
 *
 * Analyze agent execution traces and extract learnings automatically.
 *
 * @packageDocumentation
 */

// Main extractors
export { MemoryExtractor } from './MemoryExtractor';
export { GraphExtractor } from './GraphExtractor';

// Types
export type {
  LLMFunction,
  LLMAdapter,
  MemoryExtractorConfig,
  ExtractParams,
  ExtractedMemory,
  RawExtraction,
  TraceFormat,
  // Graph extraction types
  GraphExtractorConfig,
  GraphExtractParams,
  RawGraphExtractionResult,
} from './types';

// Graph prompt utilities
export {
  buildGraphExtractionPrompt,
  formatKnownEntities,
  buildGraphAskPrompt,
  buildGraphContext,
  buildEntityMergePrompt,
} from './prompts/graph-templates';

// Pre-built adapters
export { AnthropicAdapter, OpenAIAdapter, OllamaAdapter, CustomEndpointAdapter } from './adapters';

export type {
  AnthropicAdapterConfig,
  OpenAIAdapterConfig,
  OllamaAdapterConfig,
  APIAdapterConfig,
  CustomEndpointConfig,
  EndpointFormat,
} from './adapters';

// Trace scrubbing utilities
export { scrubTrace, detectPII } from './utils/scrubTrace';
export type { ScrubOptions, ScrubResult } from './utils/scrubTrace';
