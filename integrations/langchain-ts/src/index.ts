/**
 * @xache/langchain
 * LangChain.js integration for Xache Protocol
 *
 * Drop-in memory, retrieval, and collective intelligence with verifiable receipts.
 *
 * @example
 * ```typescript
 * // One-line memory replacement
 * import { XacheMemory } from '@xache/langchain';
 *
 * const memory = new XacheMemory({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * // Use with any LangChain chain
 * const chain = new ConversationChain({ llm, memory });
 * ```
 *
 * @packageDocumentation
 */

// Memory
export { XacheMemory, XacheConversationBufferMemory } from './memory';
export type { XacheMemoryConfig } from './memory';

// Chat History
export { XacheChatMessageHistory } from './chat_history';
export type { XacheChatMessageHistoryConfig } from './chat_history';

// Retrieval
export { XacheRetriever } from './retriever';
export type { XacheRetrieverConfig } from './retriever';

// Extraction
export { XacheExtractor } from './extraction';
export type {
  XacheExtractorConfig,
  ExtractedMemory,
  ExtractionResult,
} from './extraction';

// Collective Intelligence
export {
  createCollectiveContributeTool,
  createCollectiveQueryTool,
  XacheCollectiveContributeTool,
  XacheCollectiveQueryTool,
} from './collective';
export type { CollectiveToolConfig } from './collective';

// Reputation
export {
  createReputationTool,
  XacheReputationTool,
  XacheReputationChecker,
} from './reputation';
export type { ReputationToolConfig, ReputationResult } from './reputation';

// Knowledge Graph
export {
  createGraphExtractTool,
  createGraphLoadTool,
  createGraphQueryTool,
  createGraphAskTool,
  createGraphAddEntityTool,
  createGraphAddRelationshipTool,
  createGraphMergeEntitiesTool,
  createGraphEntityHistoryTool,
  XacheGraphExtractTool,
  XacheGraphLoadTool,
  XacheGraphQueryTool,
  XacheGraphAskTool,
  XacheGraphMergeEntitiesTool,
  XacheGraphEntityHistoryTool,
  XacheGraphRetriever,
} from './graph';
export type { GraphToolConfig, XacheGraphRetrieverConfig } from './graph';
