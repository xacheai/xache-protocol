/**
 * Xache Protocol TypeScript SDK
 * Main entry point
 *
 * @packageDocumentation
 */

// Main client
export { XacheClient } from './XacheClient';

// Types
export type {
  DID,
  KeyType,
  Chain,
  StorageTier,
  ErrorCode,
  APIResponse,
  Payment402Response,
  XacheClientConfig,
  XacheSigner,
  XacheWalletProvider,
  PaymentProviderConfig,
  RetryPolicy,
  CacheConfig,
  CacheStorage,
  RegisterIdentityRequest,
  RegisterIdentityResponse,
  StoreMemoryRequest,
  StoreMemoryResponse,
  RetrieveMemoryRequest,
  RetrieveMemoryResponse,
  BatchStoreMemoryRequest,
  BatchStoreMemoryResponse,
  BatchRetrieveMemoryRequest,
  BatchRetrieveMemoryResponse,
  ListMemoriesRequest,
  ListMemoriesResponse,
  MemoryListItem,
  ContributeHeuristicRequest,
  ContributeHeuristicResponse,
  QueryCollectiveRequest,
  QueryCollectiveResponse,
  HeuristicMatch,
  BudgetStatus,
  BudgetAlert,
  BudgetAlertHandler,
  Receipt,
  ReceiptWithProof,
  UsageAnalytics,
  ReputationSnapshot,
  DomainReputation,
  TopAgent,
  // ERC-8004 Portable Reputation types
  ERC8004FeedbackAuth,
  ERC8004EnableResponse,
  ERC8004ExportStatus,
  ERC8004TypedData,
  // Subject Keys types
  SubjectId,
  MemoryScope,
  SegmentId,
  TenantId,
  SubjectContext,
  SubjectRetrievalContext,
  // Cognitive Fingerprint types
  CognitiveCategory,
  ProbeRequest,
  ProbeResponse,
  // Auto-contribute types
  AutoContributeConfig,
  AutoContribution,
  ContributionOpportunity,
  AutoContributeSkipReason,
  AutoContributeState,
  AutoContributeResult,
} from './types';

export { BudgetAlertLevel } from './types';

// Extraction service types
export type {
  ExtractMemoriesRequest,
  ExtractMemoriesResponse,
} from './services/ExtractionService';

// LLM Configuration types (for extraction)
export type {
  LLMConfigType,
  LLMProvider,
  LLMApiFormat,
  LLMConfig,
  ExtractedMemory,
  ExtractionOptions,
  ExtractionResponseV2,
  ExtractionSubjectContext,
} from './types';

// Services
export { IdentityService } from './services/IdentityService';
export { MemoryService } from './services/MemoryService';
export { CollectiveService } from './services/CollectiveService';
export { BudgetService } from './services/BudgetService';
export { ReceiptService } from './services/ReceiptService';
export { ReputationService } from './services/ReputationService';
export { ExtractionService } from './services/ExtractionService';
export { AutoContributeService } from './services/AutoContributeService';
export { FacilitatorService } from './services/FacilitatorService';
export { SessionService } from './services/SessionService';
export { RoyaltyService } from './services/RoyaltyService';
export { WorkspaceService } from './services/WorkspaceService';
export { OwnerService } from './services/OwnerService';
export { WalletService } from './services/WalletService';
export { GraphService } from './services/GraphService';
export { EphemeralService } from './services/EphemeralService';

// Ephemeral context types
export type {
  EphemeralSlotName,
  CreateEphemeralSessionOptions,
  AutoProbeConfig,
  EphemeralSession,
  PromoteResult,
  EphemeralStructuredView,
  EphemeralStats,
  ListEphemeralSessionsParams,
  PaginatedEphemeralSessions,
} from './services/EphemeralService';

// Facilitator types (x402 v2)
export type {
  FacilitatorConfig,
  FacilitatorPreferences,
  FacilitatorSelection,
  NetworkId as FacilitatorNetworkId,
  PaymentScheme,
} from './services/FacilitatorService';

// Session types (x402 v2)
export type {
  WalletSession,
  CreateSessionOptions,
  SessionValidation,
  SessionScope,
} from './services/SessionService';

// Royalty types
export type {
  RevenueStats,
  PendingPayout,
  PlatformRevenue,
  TopEarner,
} from './services/RoyaltyService';

// Workspace types
export type {
  Workspace,
  WorkspaceMember,
  WorkspaceAnalytics,
  WorkspaceBudget,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  AddAgentRequest,
} from './services/WorkspaceService';

// Owner types
export type {
  Owner,
  OwnedAgent,
  EntityType,
  WalletChain,
  RegisterOwnerRequest,
  VerifyWalletRequest,
  UpdateOwnerRequest,
} from './services/OwnerService';

// Fleet budget types
export type { FleetBudgetStatus } from './services/BudgetService';

// Wallet types
export type {
  WalletNetwork,
  WalletBalance,
  OnrampUrlOptions,
  NeedsFundingOptions,
  FundingStatus,
} from './services/WalletService';

// Anchor types
export type {
  ChainAnchor,
  MerkleAnchor,
  AnchorListResponse,
} from './services/ReceiptService';

// Memory helper types (SDK sugar)
export type {
  UserPreference,
  ErrorFix,
  Pattern,
  ConversationSummary,
  ToolConfig,
  DomainHeuristic,
  OptimizationInsight,
  Memory,
} from './services/MemoryHelpers';

// Knowledge graph types + engine
export { Graph } from './graph/GraphEngine';
export type {
  Entity,
  Relationship,
  EntityType as GraphEntityType,
  RelationshipType,
  GraphLoadParams,
  GraphExtractParams,
  GraphQueryParams,
  GraphAskParams,
  AddEntityParams,
  AddRelationshipParams,
  MergeEntitiesParams,
  EntityAtParams,
  EntityHistoryParams,
  GraphExtractionResult,
  GraphExtractionTemporalUpdate,
  GraphAnswer,
} from './graph/types';

// Entity key derivation (for knowledge graph)
export {
  deriveEntityKey,
  batchDeriveEntityKeys,
} from './crypto/subject';

// Standard context conventions (SDK layer only)
export { StandardContexts } from './constants/StandardContexts';
export type { StandardContext } from './constants/StandardContexts';

// Errors
export {
  XacheError,
  UnauthenticatedError,
  PaymentRequiredError,
  RateLimitedError,
  BudgetExceededError,
  InvalidInputError,
  ConflictError,
  RetryLaterError,
  InternalError,
  NetworkError,
} from './errors/XacheError';

// Crypto utilities (for advanced usage)
export {
  generateAuthHeaders,
  generateAuthHeadersAsync,
  validateDID,
  validateTimestamp,
} from './crypto/signing';

// Signing adapter abstraction (for external wallet/signer integration)
export type { ISigningAdapter } from './crypto/SigningAdapter';
export {
  createSigningAdapter,
  PrivateKeySigningAdapter,
  ExternalSignerAdapter,
  WalletProviderAdapter,
  ReadOnlySigningAdapter,
} from './crypto/SigningAdapter';

// Convenience signer wrappers
export {
  createSignerFromEthersWallet,
  createSignerFromSolanaKeypair,
  createSignerFromAgentKit,
} from './crypto/signerHelpers';

export {
  encryptData,
  decryptData,
  generateKeyPair,
  deriveKeyFromPassword,
  generateNonce,
  generateSalt,
} from './crypto/encryption';

export type { EncryptionKeyPair, EncryptedData } from './crypto/encryption';

// Cognitive fingerprint generation (client-side zero-knowledge semantic search)
export { generateFingerprint } from './crypto/fingerprint';
export type { CognitiveFingerprint } from './crypto/fingerprint';

// Subject Keys utilities (for multi-tenant memory isolation)
export {
  deriveSubjectId,
  isValidSubjectId,
  isValidScope,
  createSubjectContext,
  createSegmentContext,
  createGlobalContext,
  validateSubjectContext,
  batchDeriveSubjectIds,
} from './crypto/subject';

export type {
  SubjectDerivationOptions,
  SubjectId as CryptoSubjectId,
  MemoryScope as CryptoMemoryScope,
  SubjectContext as CryptoSubjectContext,
} from './crypto/subject';

// Payment handler (for advanced usage)
export { PaymentHandler } from './payment/PaymentHandler';
export type { PaymentChallenge, PaymentResult } from './payment/PaymentHandler';

// Wallet generation utilities
export { WalletGenerator } from './crypto/wallet';
export type {
  WalletGenerationResult,
  WalletGenerationOptions,
} from './crypto/wallet';

// Batch operation utilities
export { batchProcess, batchProcessWithConcurrency } from './utils/batch';
export type {
  BatchItemResult,
  BatchResult,
} from './utils/batch';
