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
  validateDID,
  validateTimestamp,
} from './crypto/signing';

export {
  encryptData,
  decryptData,
  generateKeyPair,
  deriveKeyFromPassword,
  generateNonce,
  generateSalt,
} from './crypto/encryption';

export type { EncryptionKeyPair, EncryptedData } from './crypto/encryption';

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
