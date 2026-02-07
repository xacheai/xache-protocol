/**
 * TypeScript types for Xache Protocol SDK
 * Matching API contracts per LLD §2
 * Extended with Subject Keys per docs/SUBJECT-KEYS-ARCHITECTURE.md
 */

/**
 * DID format: did:agent:<evm|sol>:<address>
 */
export type DID = `did:agent:${string}:${string}`;

// =============================================================================
// SUBJECT KEYS TYPES (per SUBJECT-KEYS-ARCHITECTURE.md)
// =============================================================================

/**
 * Subject ID: 64-character hex string (HMAC-SHA256 output)
 * Derived client-side as: HMAC-SHA256(agentKey, rawSubjectId)
 */
export type SubjectId = string;

/**
 * Memory scope for subject isolation
 * - SUBJECT: Private to a specific subject (customer/user)
 * - SEGMENT: Shared within a segment (e.g., enterprise tier)
 * - GLOBAL: Agent-wide, visible to all queries
 */
export type MemoryScope = 'SUBJECT' | 'SEGMENT' | 'GLOBAL';

/**
 * Segment ID: arbitrary string identifier for grouping
 */
export type SegmentId = string;

/**
 * Tenant ID: organizational boundary identifier
 */
export type TenantId = string;

/**
 * Subject context for memory store operations
 */
export interface SubjectContext {
  /** HMAC-derived pseudonymous subject identifier (64 hex chars) */
  subjectId?: SubjectId;
  /** Memory visibility scope */
  scope: MemoryScope;
  /** Segment identifier for SEGMENT-scoped memories */
  segmentId?: SegmentId;
  /** Enterprise tenant identifier */
  tenantId?: TenantId;
}

/**
 * Subject context for memory retrieval operations
 */
export interface SubjectRetrievalContext {
  /** Subject ID to filter by */
  subjectId?: SubjectId;
  /** Include SEGMENT-scoped memories in results (default: true) */
  includeSegment?: boolean;
  /** Include GLOBAL-scoped memories in results (default: true) */
  includeGlobal?: boolean;
  /** Filter by specific segment ID */
  segmentId?: SegmentId;
  /** Tenant ID for enterprise isolation */
  tenantId?: TenantId;
}

/**
 * Key types per LLD
 */
export type KeyType = 'evm' | 'solana';

/**
 * Chain types per LLD
 */
export type Chain = 'base' | 'solana';

/**
 * Storage tiers per LLD §2.4
 */
export type StorageTier = 'hot' | 'warm' | 'cold';

/**
 * Error codes per LLD §2.1
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'PAYMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'RETRY_LATER'
  | 'INTERNAL'
  | 'NOT_FOUND';

/**
 * API response wrapper per LLD §2.1
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
    duration: number;
  };
}

/**
 * 402 Payment Required response per LLD §2.3
 */
export interface Payment402Response {
  error: {
    code: 'PAYMENT_REQUIRED';
    message: string;
  };
  payment: {
    challengeId: string;
    amount: string;
    chainHint: 'solana' | 'base';
    payTo: string;
    description: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
    duration: number;
  };
}

/**
 * Retry policy configuration for automatic error recovery
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Backoff delays in ms for each retry attempt (default: [1000, 2000, 4000]) */
  backoffMs?: number[];

  /** Error codes that should trigger retries (default: ['RETRY_LATER', 'INTERNAL']) */
  retryableErrors?: ErrorCode[];

  /** Overall timeout for the operation including retries in ms (default: 60000) */
  timeout?: number;
}

/**
 * Cache storage type
 */
export type CacheStorage = 'memory' | 'localStorage';

/**
 * Cache configuration for local memory caching
 */
export interface CacheConfig {
  /** Enable caching (default: false) */
  enabled?: boolean;

  /** Maximum number of entries to cache (default: 1000) */
  maxSize?: number;

  /** Time-to-live in ms (default: 3600000 - 1 hour) */
  ttl?: number;

  /** Storage backend (default: 'memory') */
  storage?: CacheStorage;
}

// =============================================================================
// XACHE SIGNER INTERFACE (AgentKit Compatibility)
// =============================================================================

/**
 * Wallet-agnostic signer interface for EVM payments.
 * Compatible with AgentKit, ethers.Wallet, and custom implementations.
 *
 * @example
 * ```typescript
 * // Using with AgentKit
 * import { AgentKit } from '@coinbase/agentkit';
 *
 * const agentkit = await AgentKit.create();
 * const wallet = await agentkit.getWallet();
 *
 * // Wrap AgentKit wallet as XacheSigner
 * const signer: XacheSigner = {
 *   getAddress: async () => wallet.address,
 *   signTypedData: async (domain, types, value) => {
 *     return wallet.signTypedData(domain, types, value);
 *   },
 * };
 *
 * const client = new XacheClient({ did, signer });
 * ```
 */
export interface XacheSigner {
  /** Get wallet address */
  getAddress(): Promise<string>;

  /**
   * Sign EIP-712 typed data (for EVM payments).
   * Returns hex-encoded signature.
   */
  signTypedData(
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    },
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string>;

  /**
   * Sign raw message bytes (optional, for Solana or general signatures).
   * Returns signature bytes.
   */
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Wallet provider interface for AgentKit integration.
 * Provides access to a signer instance.
 *
 * @example
 * ```typescript
 * // Using AgentKit as wallet provider
 * import { AgentKit } from '@coinbase/agentkit';
 *
 * const agentkit = await AgentKit.create();
 *
 * const provider: XacheWalletProvider = {
 *   getSigner: async () => createXacheSignerFromAgentKit(agentkit),
 *   getAddress: async () => (await agentkit.getWallet()).address,
 *   getChainType: () => 'evm',
 * };
 *
 * const client = new XacheClient({ did, walletProvider: provider });
 * ```
 */
export interface XacheWalletProvider {
  /** Get signer for transactions */
  getSigner(): Promise<XacheSigner>;

  /** Get wallet address */
  getAddress(): Promise<string>;

  /** Get chain type */
  getChainType(): 'evm' | 'solana';
}

/**
 * Client configuration
 */
export interface XacheClientConfig {
  /** API Gateway URL */
  apiUrl: string;

  /** Agent DID */
  did: DID;

  /** Private key for signing (hex string). Optional for read-only operations. */
  privateKey?: string;

  /**
   * Alternative to privateKey: Use a custom signer (e.g., AgentKit wallet).
   * If both privateKey and signer are provided, privateKey takes precedence.
   */
  signer?: XacheSigner;

  /**
   * Alternative to privateKey: Use a wallet provider (e.g., AgentKit).
   * The provider's getSigner() will be called when signing is needed.
   * If both privateKey and walletProvider are provided, privateKey takes precedence.
   */
  walletProvider?: XacheWalletProvider;

  /** Payment provider configuration */
  paymentProvider?: PaymentProviderConfig;

  /** Request timeout in ms (default: 30000) */
  timeout?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Retry policy for automatic error recovery */
  retryPolicy?: RetryPolicy;

  /** Cache configuration for memory operations */
  cache?: CacheConfig;

  /**
   * Auto-contribute configuration (opt-in).
   * When enabled, high-confidence extracted insights are automatically
   * contributed to the collective intelligence network.
   *
   * @example
   * ```typescript
   * const client = new XacheClient({
   *   // ... other config
   *   autoContribute: {
   *     enabled: true,
   *     confidenceThreshold: 0.85,
   *     domains: ['trading', 'defi'],
   *     maxPerDay: 20,
   *     onContribute: (contribution) => {
   *       console.log(`Contributed: ${contribution.heuristicId}`);
   *     },
   *   },
   * });
   * ```
   */
  autoContribute?: AutoContributeConfig;
}

/**
 * Payment provider configuration
 */
export interface PaymentProviderConfig {
  /** Provider type */
  type: 'coinbase-commerce' | 'manual';

  /** API key for provider */
  apiKey?: string;

  /** Webhook URL for payment notifications */
  webhookUrl?: string;
}

/**
 * Identity registration request per LLD §2.2
 */
export interface RegisterIdentityRequest {
  walletAddress: string;
  keyType: KeyType;
  chain: Chain;
  /** Optional owner DID for SDK Auto-Registration (Option A) */
  ownerDID?: string;
  [key: string]: unknown;
}

/**
 * Identity registration response per LLD §2.2
 */
export interface RegisterIdentityResponse {
  did: DID;
  walletAddress: string;
  keyType: KeyType;
  chain: Chain;
  createdAt: string;
}

/**
 * Identity retrieval response
 */
export interface GetIdentityResponse {
  did: DID;
  walletAddress: string;
  keyType: KeyType;
  chain: Chain;
  reputationScore: number;
  createdAt: string;
  updatedAt?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Identity update request
 */
export interface UpdateIdentityRequest {
  /** Optional name for the agent */
  name?: string;
  /** Optional metadata object */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Identity update response
 */
export interface UpdateIdentityResponse {
  did: DID;
  walletAddress: string;
  keyType: KeyType;
  chain: Chain;
  reputationScore: number;
  createdAt: string;
  updatedAt?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Submit claim request (Option B: Async Claim Approval)
 */
export interface SubmitClaimRequest {
  agentDID: DID;
  webhookUrl?: string;
  [key: string]: unknown;
}

/**
 * Submit claim response
 */
export interface SubmitClaimResponse {
  claimId: string;
  status: 'pending';
  message: string;
}

/**
 * Process claim request (Option B: Async Claim Approval)
 */
export interface ProcessClaimRequest {
  ownerDID: DID;
  approved: boolean;
  ownerSignature?: string;
  agentSignature?: string;
  message?: string;
  timestamp?: number;
  rejectionReason?: string;
  [key: string]: unknown;
}

/**
 * Process claim response
 */
export interface ProcessClaimResponse {
  status: 'approved' | 'rejected';
  message: string;
}

/**
 * Pending claim
 */
export interface PendingClaim {
  claimId: string;
  ownerDID: DID;
  ownerWallet: string;
  requestedAt: string;
  webhookUrl?: string;
}

/**
 * Pending claim by owner
 */
export interface PendingClaimByOwner {
  agentDID: DID;
  agentWallet: string;
  requestedAt: string;
  status: string;
}

/**
 * On-chain claim request (Option C: On-chain Claiming)
 */
export interface OnChainClaimRequest {
  agentDID: DID;
  txHash: string;
  chain: 'solana' | 'base';
  [key: string]: unknown;
}

/**
 * On-chain claim response
 */
export interface OnChainClaimResponse {
  status: 'approved';
  txHash: string;
  method: string;
  message: string;
}

/**
 * Memory store request per LLD §2.4
 * Extended with Subject Keys per docs/SUBJECT-KEYS-ARCHITECTURE.md
 */
export interface StoreMemoryRequest {
  /** Data to encrypt and store */
  data: Record<string, unknown>;

  /** Storage tier */
  storageTier: StorageTier;

  /** Optional context for pattern intelligence */
  context?: string;

  /** Optional tags for categorization */
  tags?: string[];

  /** Optional metadata */
  metadata?: Record<string, unknown>;

  /** Optional expiration date (ISO 8601) */
  expiresAt?: string;

  // === Subject Keys Fields ===

  /**
   * Subject context for multi-tenant memory isolation.
   * Use client.createSubjectContext(), client.createSegmentContext(), or client.createGlobalContext()
   * to create this object.
   */
  subject?: SubjectContext;

  /** @deprecated Use subject.subjectId instead */
  subjectId?: SubjectId;

  /** @deprecated Use subject.scope instead */
  scope?: MemoryScope;

  /** @deprecated Use subject.segmentId instead */
  segmentId?: SegmentId;

  /** @deprecated Use subject.tenantId instead */
  tenantId?: TenantId;

  /** Opt-in immediate anchoring (5-min instead of daily). Adds $0.005/receipt surcharge. */
  anchoring?: 'immediate';
}

/**
 * Memory store response per LLD §2.4
 */
export interface StoreMemoryResponse {
  storageKey: string;
  storageTier: StorageTier;
  size: number;
  receiptId: string;
  anchoringTier?: 'daily' | 'immediate';
  anchoringStatus?: 'pending' | 'anchored';
  estimatedAnchorTime?: string;
}

/**
 * Memory retrieve request per LLD §2.4
 * Extended with Subject Keys per docs/SUBJECT-KEYS-ARCHITECTURE.md
 */
export interface RetrieveMemoryRequest {
  /** Storage key of the memory to retrieve */
  storageKey: string;

  /**
   * Subject context for access control validation.
   * If provided, the server validates that the requesting context has
   * access to the memory based on its scope.
   */
  subject?: SubjectRetrievalContext;

  /** Opt-in immediate anchoring (5-min instead of daily). Adds $0.005/receipt surcharge. */
  anchoring?: 'immediate';
}

/**
 * Memory retrieve response per LLD §2.4
 */
export interface RetrieveMemoryResponse {
  storageKey: string;
  data: Record<string, unknown>;
  storageTier: StorageTier;
  metadata?: Record<string, unknown>;
  receiptId: string;
  anchoringTier?: 'daily' | 'immediate';
  anchoringStatus?: 'pending' | 'anchored';
  estimatedAnchorTime?: string;
}

/**
 * Batch store memory request per PRD FR-010, LLD §2.3
 * Max 100 items per batch
 */
export interface BatchStoreMemoryRequest {
  /** Array of memories to store (max 100) */
  items: StoreMemoryRequest[];
}

/**
 * Batch store memory response per LLD §2.3
 */
export interface BatchStoreMemoryResponse {
  /** Per-item results */
  results: Array<{
    /** Index in the original request array */
    index: number;
    /** Storage key if successful */
    storageKey?: string;
    /** Receipt ID if successful */
    receiptId?: string;
    /** Error message if failed */
    error?: string;
  }>;
  /** Total number of successful stores */
  successCount: number;
  /** Total number of failed stores */
  failureCount: number;
  /** Aggregate receipt ID for the entire batch */
  batchReceiptId: string;
}

/**
 * Batch retrieve memory request per PRD FR-011, LLD §2.3
 * Max 100 items per batch
 */
export interface BatchRetrieveMemoryRequest {
  /** Array of storage keys to retrieve (max 100) */
  storageKeys: string[];
}

/**
 * Batch retrieve memory response per LLD §2.3
 */
export interface BatchRetrieveMemoryResponse {
  /** Per-item results */
  results: Array<{
    /** Index in the original request array */
    index: number;
    /** Storage key */
    storageKey?: string;
    /** Decrypted data if successful */
    data?: Record<string, unknown>;
    /** Storage tier if successful */
    storageTier?: StorageTier;
    /** Metadata if available */
    metadata?: Record<string, unknown>;
    /** Receipt ID if successful */
    receiptId?: string;
    /** Error message if failed */
    error?: string;
  }>;
  /** Total number of successful retrievals */
  successCount: number;
  /** Total number of failed retrievals */
  failureCount: number;
  /** Aggregate receipt ID for the entire batch */
  batchReceiptId: string;
}

/**
 * List memories request
 * Extended with Subject Keys per docs/SUBJECT-KEYS-ARCHITECTURE.md
 */
export interface ListMemoriesRequest {
  /** Filter by context */
  context?: string;
  /** Filter by storage tier */
  tier?: StorageTier;
  /** Maximum number of results (default: 50, max: 100) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort by field (default: 'created') */
  sortBy?: 'created' | 'accessed' | 'size';

  // === Subject Keys Fields ===

  /** Subject ID to filter by */
  subjectId?: SubjectId;
  /** Filter by memory scope (SUBJECT, SEGMENT, GLOBAL) */
  scope?: MemoryScope;
  /** Filter by segment ID */
  segmentId?: SegmentId;
  /** Filter by tenant ID */
  tenantId?: TenantId;
}

/**
 * Memory list item (metadata only, no decryption)
 */
export interface MemoryListItem {
  /** Storage key */
  storage_key: string;
  /** Agent DID */
  agent_did: string;
  /** Storage tier */
  storage_tier: StorageTier;
  /** Size in bytes */
  size_bytes: number;
  /** Context string */
  context?: string;
  /** Tags array */
  tags?: string[];
  /** Arbitrary metadata (set at store time) */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  created_at: string;
  /** Last accessed timestamp */
  accessed_at: string;
  /** Updated timestamp */
  updated_at?: string;
}

/**
 * List memories response
 */
export interface ListMemoriesResponse {
  /** Array of memory items (metadata only) */
  memories: MemoryListItem[];
  /** Total count of matching memories */
  total: number;
  /** Limit used */
  limit: number;
  /** Offset used */
  offset: number;
}

/**
 * Heuristic metrics per LLD §2.4
 */
export interface HeuristicMetrics {
  /** Success rate of heuristic (0.00 to 1.00) */
  successRate: number;
  /** Number of samples used to determine metrics */
  sampleSize: number;
  /** Confidence level (0.00 to 1.00) */
  confidence: number;
}

/**
 * Collective contribute request per LLD §2.5
 */
export interface ContributeHeuristicRequest {
  /** Pattern text (10-500 chars) */
  pattern: string;
  /** Hash of the pattern for deduplication */
  patternHash: string;
  /** Domain (e.g., 'javascript', 'python', 'devops') */
  domain: string;
  /** Tags for categorization (1-10 tags) */
  tags: string[];
  /** Metrics about heuristic effectiveness per LLD §2.4 */
  metrics: HeuristicMetrics;
  /** Reference to encrypted content in R2 storage */
  encryptedContentRef: string;
  /** Optional context type */
  contextType?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Opt-in immediate anchoring (5-min instead of daily). Adds $0.005/receipt surcharge. */
  anchoring?: 'immediate';
  [key: string]: unknown;
}

/**
 * Collective contribute response per LLD §2.5
 */
export interface ContributeHeuristicResponse {
  heuristicId: string;
  pattern: string;
  domain: string;
  tags: string[];
  receiptId: string;
  anchoringTier?: 'daily' | 'immediate';
  anchoringStatus?: 'pending' | 'anchored';
  estimatedAnchorTime?: string;
}

/**
 * Collective query request per LLD §2.5
 */
export interface QueryCollectiveRequest {
  queryText: string;
  domain?: string;
  limit?: number;
  /** Opt-in immediate anchoring (5-min instead of daily). Adds $0.005/receipt surcharge. */
  anchoring?: 'immediate';
  [key: string]: unknown;
}

/**
 * Collective query response per LLD §2.5
 */
export interface QueryCollectiveResponse {
  matches: HeuristicMatch[];
  totalCost: string;
  royaltiesUSD: string;
  receiptId: string;
  anchoringTier?: 'daily' | 'immediate';
  anchoringStatus?: 'pending' | 'anchored';
  estimatedAnchorTime?: string;
}

/**
 * Heuristic match in query results
 */
export interface HeuristicMatch {
  heuristicId: string;
  pattern: string;
  domain: string;
  tags: string[];
  contributorDID: DID;
  relevanceScore: number;
  royaltyAmount: string;
}

/**
 * Budget status response
 */
export interface BudgetStatus {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentageUsed: number;
  currentPeriod: string;
}

/**
 * Budget alert levels per HLD §2.2 Budget Guardian
 */
export enum BudgetAlertLevel {
  /** 50% threshold warning */
  WARN_50 = 'WARN_50',
  /** 80% threshold warning */
  WARN_80 = 'WARN_80',
  /** 100% critical threshold */
  CRITICAL_100 = 'CRITICAL_100',
}

/**
 * Budget alert details
 */
export interface BudgetAlert {
  /** Alert severity level */
  level: BudgetAlertLevel;
  /** Threshold percentage that triggered alert (50, 80, or 100) */
  threshold: number;
  /** Current budget usage percentage */
  percentageUsed: number;
  /** Amount spent in cents */
  spentCents: number;
  /** Budget limit in cents */
  limitCents: number;
  /** Remaining budget in cents */
  remainingCents: number;
  /** Human-readable alert message */
  message: string;
  /** Timestamp when alert was triggered */
  timestamp: string;
}

/**
 * Budget alert handler callback
 */
export type BudgetAlertHandler = (alert: BudgetAlert) => void | Promise<void>;

/**
 * Receipt
 */
export interface Receipt {
  receiptId: string;
  agentDID: DID;
  operation: string;
  amountUSD: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Receipt with Merkle proof
 */
export interface ReceiptWithProof {
  receiptId: string;
  merkleProof: string[];
  merkleRoot: string;
}

/**
 * Usage analytics
 */
export interface UsageAnalytics {
  operations: Array<{
    operation: string;
    count: number;
    totalCost: string;
  }>;
  totalSpent: string;
  period: {
    start: string;
    end: string;
  };
}

/**
 * Reputation snapshot per HLD §2.2
 */
export interface ReputationSnapshot {
  /** Agent DID */
  agentDID: DID;
  /** Snapshot timestamp */
  timestamp: string;
  /** Overall reputation score (0-100) */
  overall: number;
  /** Memory quality score (0-100) */
  memoryQuality: number;
  /** Contribution success score (0-100) */
  contribSuccess: number;
  /** Economic value score (0-100) */
  economicValue: number;
  /** Network influence score (0-100) */
  networkInfluence: number;
  /** Reliability score (0-100) */
  reliability: number;
  /** Specialization score (0-100) */
  specialization: number;
  /** Score weights */
  weights: Record<string, number>;
}

/**
 * Domain-specific reputation per HLD §2.2
 */
export interface DomainReputation {
  /** Domain name (e.g., 'javascript', 'python', 'devops') */
  domain: string;
  /** Domain-specific reputation score (0-100) */
  score: number;
  /** Number of contributions in this domain */
  contributionCount: number;
  /** Success rate in this domain (0.00 to 1.00) */
  successRate: number;
  /** Total earnings in USD for this domain */
  totalEarnedUSD: string;
}

/**
 * Top agent entry for leaderboard
 */
export interface TopAgent {
  /** Agent DID */
  agentDID: DID;
  /** Agent wallet address */
  walletAddress: string;
  /** Overall reputation score (0-100) */
  reputationScore: number;
  /** Total number of operations */
  operationCount: number;
  /** Total earned in USD */
  totalEarnedUSD: string;
}

// ===========================
// Extraction Service Types
// ===========================

export type LLMConfigType = 'api-key' | 'endpoint' | 'xache-managed';

/**
 * Supported LLM providers for api-key mode
 * These are major providers with known API endpoints
 */
export type LLMProvider =
  | 'anthropic'   // api.anthropic.com - Claude models
  | 'openai'      // api.openai.com - GPT models
  | 'google'      // generativelanguage.googleapis.com - Gemini models
  | 'mistral'     // api.mistral.ai - Mistral models
  | 'groq'        // api.groq.com - Fast inference
  | 'together'    // api.together.xyz - Open models
  | 'fireworks'   // api.fireworks.ai - Fast open models
  | 'cohere'      // api.cohere.com - Command models
  | 'xai'         // api.x.ai - Grok models
  | 'deepseek';   // api.deepseek.com - DeepSeek models

/**
 * API format for endpoint mode
 * Most providers use OpenAI-compatible format
 */
export type LLMApiFormat = 'openai' | 'anthropic' | 'cohere';

/**
 * LLM Configuration
 * Specifies how the extraction service should access an LLM
 *
 * Three modes:
 * - api-key: Use a major provider with known endpoint (we maintain the URL mapping)
 * - endpoint: Use any custom/self-hosted endpoint (Ollama, OpenRouter, vLLM, etc.)
 * - xache-managed: Xache provides the LLM (higher cost, no key needed)
 */
export type LLMConfig =
  | {
      /** Use a major provider - we know their API endpoint */
      type: 'api-key';
      /** The provider name - determines which API endpoint to use */
      provider: LLMProvider;
      /** Your API key for this provider */
      apiKey: string;
      /** Optional model override (each provider has a default) */
      model?: string;
    }
  | {
      /** Use any custom endpoint - you provide the URL */
      type: 'endpoint';
      /** Full URL to the chat/completions endpoint */
      url: string;
      /** Auth token (sent as Bearer token in Authorization header) */
      authToken?: string;
      /** Model name to use */
      model?: string;
      /** API format - defaults to 'openai' which most providers support */
      format?: LLMApiFormat;
    }
  | {
      /** Xache provides the LLM - no API key needed, higher cost ($0.011 vs $0.002) */
      type: 'xache-managed';
      /** Which provider Xache should use */
      provider?: 'anthropic' | 'openai';
      /** Optional model override */
      model?: string;
    };

/**
 * Subject context for extraction auto-storage
 */
export interface ExtractionSubjectContext {
  /** HMAC-derived pseudonymous subject identifier (64 hex chars) */
  subjectId?: SubjectId;
  /** Memory visibility scope */
  scope?: MemoryScope;
  /** Segment identifier for SEGMENT-scoped memories */
  segmentId?: SegmentId;
  /** Enterprise tenant identifier */
  tenantId?: TenantId;
}

/**
 * Extraction Options
 */
export interface ExtractionOptions {
  maxMemories?: number;
  confidenceThreshold?: number;
  contextHint?: string;
  autoStore?: boolean;
  /**
   * Subject Keys context for auto-stored memories
   * When autoStore=true, these fields determine memory isolation
   *
   * @example
   * ```typescript
   * const result = await client.extraction.extract({
   *   trace: agentTrace,
   *   llmConfig: { type: 'api-key', provider: 'anthropic', apiKey },
   *   options: {
   *     autoStore: true,
   *     subject: {
   *       subjectId: await client.deriveSubjectId(customerId),
   *       scope: 'SUBJECT',
   *       tenantId: 'enterprise_acme'
   *     }
   *   }
   * });
   * ```
   */
  subject?: ExtractionSubjectContext;
}

/**
 * Extracted Memory
 */
export interface ExtractedMemory {
  type: string;
  confidence: number;
  data: Record<string, unknown>;
  reasoning: string;
  suggestedMethod: string;
  evidence?: string;
}

/**
 * Extraction Response (V2)
 */
export interface ExtractionResponseV2 {
  success: boolean;
  extractions: ExtractedMemory[];
  stored?: string[];
  metadata: {
    extractionTime: number;
    llmProvider: string;
    llmModel: string;
    totalExtractions: number;
    storedCount: number;
    paymentReceiptId?: string;
  };
  error?: string;
  warnings?: string[];
  /** Auto-contributions made (if auto-contribute enabled) */
  autoContributed?: AutoContribution[];
  /** Contribution opportunity hint (if auto-contribute disabled but insights qualify) */
  contributionOpportunity?: ContributionOpportunity;
}

// ===========================
// Auto-Contribute Types (LLD §15)
// ===========================

/**
 * Configuration for auto-contribute feature
 * Automatically contributes high-confidence extracted insights to collective
 */
export interface AutoContributeConfig {
  /** Must be explicitly true to enable (opt-in only) */
  enabled: boolean;

  /** Minimum confidence score to contribute (0.0-1.0, default 0.8) */
  confidenceThreshold?: number;

  /** Minimum agent reputation to contribute (0.0-1.0, default 0.5) */
  minReputation?: number;

  /** Only contribute to these domains (optional, all if not specified) */
  domains?: string[];

  /** Never contribute to these domains (optional) */
  excludeDomains?: string[];

  /** Delay in hours before contributing (default 0) */
  delayHours?: number;

  /** Maximum contributions per day (default 50) */
  maxPerDay?: number;

  /** Callback when contribution is made */
  onContribute?: (contribution: AutoContribution) => void;
}

/**
 * Result of an auto-contribution
 */
export interface AutoContribution {
  /** Heuristic ID of the contributed insight */
  heuristicId: string;
  /** Domain the insight was contributed to */
  domain: string;
  /** Confidence score of the original extraction */
  confidence: number;
  /** Timestamp of contribution */
  contributedAt: number;
  /** Source extraction ID (if available) */
  extractionId?: string;
}

/**
 * Contribution opportunity hint (returned when auto-contribute disabled)
 * Informs developers about insights that could be contributed
 */
export interface ContributionOpportunity {
  /** Number of extractions that qualify for contribution */
  eligibleCount: number;
  /** Sample of qualifying insights (up to 5) */
  insights: Array<{
    domain: string;
    confidence: number;
    heuristicType: string;
  }>;
  /** Human-readable message */
  message: string;
  /** Documentation URL */
  learnMore: string;
}

/**
 * Skip reason for tracking auto-contribute decisions
 */
export type AutoContributeSkipReason =
  | 'disabled'
  | 'low_confidence'
  | 'low_reputation'
  | 'domain_excluded'
  | 'domain_not_allowed'
  | 'rate_limited'
  | 'duplicate'
  | 'delayed'
  | 'error';

/**
 * Internal state for auto-contribute rate limiting and tracking
 */
export interface AutoContributeState {
  /** Number of contributions made today */
  contributionsToday: number;
  /** Timestamp of last contribution */
  lastContributionAt: number;
  /** Start of current day (for rate limit reset) */
  dayStartedAt: number;
  /** Set of content hashes already contributed (deduplication) */
  contributedHashes: Set<string>;
  /** Pending delayed contributions */
  pendingDelayed: Array<{
    insight: ExtractedMemory;
    contributeAt: number;
  }>;
}

/**
 * Result of auto-contribute evaluation
 */
export interface AutoContributeResult {
  /** Successfully contributed insights */
  contributed: AutoContribution[];
  /** Skipped insights with reasons */
  skipped: Array<{
    extraction: ExtractedMemory;
    reason: AutoContributeSkipReason;
  }>;
  /** Opportunity hint (if disabled but insights qualify) */
  opportunity?: ContributionOpportunity;
}

// =============================================================================
// ERC-8004 TYPES (Portable Agent Reputation)
// =============================================================================

/**
 * ERC-8004 FeedbackAuth - Authorization for Xache to submit reputation
 * Must be signed by agent's private key
 */
export interface ERC8004FeedbackAuth {
  /** Agent's NFT ID in 8004 Identity Registry (or '0' if not registered) */
  agentId: string;
  /** Xache's export service address (will receive permission to submit feedback) */
  clientAddress: string;
  /** Maximum number of feedback entries this authorization allows */
  indexLimit: number;
  /** Unix timestamp when this authorization expires */
  expiry: number;
  /** Chain ID (8453 for Base mainnet, 84532 for Base Sepolia) */
  chainId: number;
  /** ERC-8004 Identity Registry contract address */
  identityRegistry: string;
  /** Agent's wallet address (signer) */
  signerAddress: string;
}

/**
 * Signed ERC-8004 authorization to submit to server
 */
export interface ERC8004AuthorizationRequest {
  /** The authorization parameters */
  authorization: ERC8004FeedbackAuth;
  /** EIP-712 signature from agent's private key */
  signature: string;
}

/**
 * Response from enabling ERC-8004 export
 */
export interface ERC8004EnableResponse {
  /** Whether the authorization was stored successfully */
  success: boolean;
  /** Authorization ID for tracking */
  authorizationId: string;
  /** When the authorization expires */
  expiresAt: string;
  /** Maximum feedbacks allowed */
  indexLimit: number;
  /** Agent's ERC-8004 ID (if already registered) */
  erc8004AgentId?: string;
  /** Message */
  message: string;
}

/**
 * ERC-8004 export status for an agent
 */
export interface ERC8004ExportStatus {
  /** Whether agent has opted in to ERC-8004 export */
  enabled: boolean;
  /** Whether authorization is still valid */
  isValid: boolean;
  /** When current authorization expires */
  expiresAt?: string;
  /** Number of feedbacks used */
  feedbacksUsed?: number;
  /** Maximum feedbacks allowed */
  feedbacksLimit?: number;
  /** Agent's ERC-8004 ID (if registered) */
  erc8004AgentId?: string;
  /** Last export timestamp */
  lastExportedAt?: string;
  /** Last exported score */
  lastExportedScore?: number;
}

/**
 * EIP-712 Typed Data structure for ERC-8004 authorization
 * Compatible with eth_signTypedData_v4 (MetaMask, WalletConnect, etc.)
 */
export interface ERC8004TypedData {
  /** EIP-712 domain */
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  /** EIP-712 types */
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    FeedbackAuth: Array<{ name: string; type: string }>;
  };
  /** Primary type being signed */
  primaryType: 'FeedbackAuth';
  /** Values to sign */
  message: {
    agentId: string;
    clientAddress: string;
    indexLimit: string;
    expiry: string;
    chainId: string;
    identityRegistry: string;
    signerAddress: string;
  };
}
