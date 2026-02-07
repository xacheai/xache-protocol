/**
 * Xache Protocol TypeScript SDK
 * Main client class
 */

import type {
  XacheClientConfig,
  APIResponse,
  PaymentProviderConfig,
  RetryPolicy,
  CacheConfig,
  SubjectId,
  SubjectContext,
  MemoryScope,
  AutoContributeConfig,
  DID,
} from './types';
import { HttpClient } from './utils/http';
import { generateAuthHeaders, validateDID, deriveEVMAddress, deriveSolanaAddress } from './crypto/signing';
import {
  deriveSubjectId as deriveSubjectIdCrypto,
  createSubjectContext as createSubjectContextUtil,
  createSegmentContext as createSegmentContextUtil,
  createGlobalContext as createGlobalContextUtil,
  batchDeriveSubjectIds as batchDeriveSubjectIdsCrypto,
  type SubjectDerivationOptions,
} from './crypto/subject';
import { IdentityService } from './services/IdentityService';
import { MemoryService } from './services/MemoryService';
import { CollectiveService } from './services/CollectiveService';
import { BudgetService } from './services/BudgetService';
import { ReceiptService } from './services/ReceiptService';
import { ReputationService } from './services/ReputationService';
import { ExtractionService } from './services/ExtractionService';
import { FacilitatorService } from './services/FacilitatorService';
import { SessionService } from './services/SessionService';
import { RoyaltyService } from './services/RoyaltyService';
import { WorkspaceService } from './services/WorkspaceService';
import { OwnerService } from './services/OwnerService';
import { WalletService } from './services/WalletService';
import { GraphService } from './services/GraphService';
import { PaymentHandler } from './payment/PaymentHandler';

/**
 * Main Xache client
 *
 * @example
 * ```typescript
 * const client = new XacheClient({
 *   apiUrl: 'https://api.xache.xyz',
 *   did: 'did:agent:evm:0xYourWalletAddress',
 *   privateKey: '0x...',
 * });
 *
 * // Register identity
 * await client.identity.register({
 *   walletAddress: '0xYourWalletAddress',
 *   keyType: 'evm',
 *   chain: 'base',
 * });
 *
 * // Store memory
 * await client.memory.store({
 *   data: { key: 'value' },
 *   storageTier: 'hot',
 * });
 * ```
 */
export class XacheClient {
  private readonly config: Required<Omit<XacheClientConfig, 'privateKey' | 'signer' | 'walletProvider' | 'paymentProvider' | 'retryPolicy' | 'cache' | 'autoContribute'>> & {
    privateKey?: string;
    signer?: import('./types').XacheSigner;
    walletProvider?: import('./types').XacheWalletProvider;
    paymentProvider?: PaymentProviderConfig;
    retryPolicy?: RetryPolicy;
    cache?: CacheConfig;
    autoContribute?: AutoContributeConfig;
  };
  private readonly httpClient: HttpClient;
  private readonly paymentHandler?: PaymentHandler;

  // Service instances
  public readonly identity: IdentityService;
  public readonly memory: MemoryService;
  public readonly collective: CollectiveService;
  public readonly budget: BudgetService;
  public readonly receipts: ReceiptService;
  public readonly reputation: ReputationService;
  public readonly extraction: ExtractionService;
  public readonly facilitators: FacilitatorService;
  public readonly sessions: SessionService;
  public readonly royalty: RoyaltyService;
  public readonly workspaces: WorkspaceService;
  public readonly owner: OwnerService;
  public readonly wallet: WalletService;
  public readonly graph: GraphService;

  constructor(config: XacheClientConfig) {
    // Validate configuration
    this.validateConfig(config);

    // Set defaults - explicitly include all required properties
    this.config = {
      apiUrl: config.apiUrl,
      did: config.did,
      privateKey: config.privateKey,
      signer: config.signer,
      walletProvider: config.walletProvider,
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      retryPolicy: config.retryPolicy,
      cache: config.cache,
      paymentProvider: config.paymentProvider,
      autoContribute: config.autoContribute,
    };

    // Initialize HTTP client with privateKey for autopay (if provided)
    this.httpClient = new HttpClient(this.config.timeout, undefined, this.config.debug, this.config.privateKey);

    // Initialize payment handler only if privateKey provided
    if (this.config.privateKey) {
      this.paymentHandler = new PaymentHandler(this.config.privateKey, this.config.debug);
    }

    // Initialize services
    this.identity = new IdentityService(this);
    this.memory = new MemoryService(this);
    this.collective = new CollectiveService(this);
    this.budget = new BudgetService(this);
    this.receipts = new ReceiptService(this);
    this.reputation = new ReputationService(this);
    this.extraction = new ExtractionService(this, this.config.autoContribute);
    this.facilitators = new FacilitatorService(this);
    this.sessions = new SessionService(this);
    this.royalty = new RoyaltyService(this);
    this.workspaces = new WorkspaceService(this);
    this.owner = new OwnerService(this);
    this.wallet = new WalletService(this);
    this.graph = new GraphService(this);

    if (this.config.debug) {
      console.log('Xache client initialized:', {
        apiUrl: this.config.apiUrl,
        did: this.config.did,
        timeout: this.config.timeout,
      });
    }
  }

  /**
   * Validate client configuration
   */
  private validateConfig(config: XacheClientConfig): void {
    if (!config.apiUrl) {
      throw new Error('apiUrl is required');
    }

    if (!config.did) {
      throw new Error('did is required');
    }

    if (!validateDID(config.did)) {
      throw new Error(`Invalid DID format: ${config.did}. Expected: did:<agent|owner>:<evm|sol>:<address>`);
    }

    // privateKey is optional - only validate format if provided
    if (config.privateKey) {
      // Validate private key format (hex string)
      // EVM (secp256k1): 64 chars (32 bytes)
      // Solana (ed25519): 128 chars (64 bytes)
      const cleanKey = config.privateKey.startsWith('0x')
        ? config.privateKey.slice(2)
        : config.privateKey;

      if (!/^[a-fA-F0-9]{64}$/.test(cleanKey) && !/^[a-fA-F0-9]{128}$/.test(cleanKey)) {
        throw new Error('privateKey must be a 64-character (EVM) or 128-character (Solana) hex string');
      }

      // Cross-validate: ensure private key matches the address in the DID
      const didParts = config.did.split(':');
      const chain = didParts[2]; // 'evm' or 'sol'
      const didAddress = didParts[3]; // wallet address

      try {
        if (chain === 'evm') {
          const derivedAddress = deriveEVMAddress(cleanKey);
          if (derivedAddress.toLowerCase() !== didAddress.toLowerCase()) {
            throw new Error(
              `Private key does not match DID address. ` +
              `Expected: ${didAddress.toLowerCase()}, Got: ${derivedAddress.toLowerCase()}`
            );
          }
        } else if (chain === 'sol') {
          const derivedAddress = deriveSolanaAddress(cleanKey);
          if (derivedAddress !== didAddress) {
            throw new Error(
              `Private key does not match DID address. ` +
              `Expected: ${didAddress}, Got: ${derivedAddress}`
            );
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('does not match')) {
          throw error;
        }
        throw new Error(`Failed to validate private key: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Check if client is configured for write operations (has privateKey)
   */
  isReadOnly(): boolean {
    return !this.config.privateKey;
  }

  /**
   * Make authenticated API request
   *
   * @internal
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    options?: {
      idempotencyKey?: string;
      skipAuth?: boolean;
    }
  ): Promise<APIResponse<T>> {
    const url = `${this.config.apiUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : '';

    // Build headers
    const headers: Record<string, string> = {};

    // Add authentication headers (unless skipped)
    if (!options?.skipAuth) {
      if (!this.config.privateKey) {
        throw new Error(
          `privateKey is required for authenticated requests. ` +
          `This client is read-only. To make authenticated requests, ` +
          `create a new XacheClient with a privateKey.`
        );
      }
      try {
        const authHeaders = generateAuthHeaders(
          method,
          path,
          bodyStr,
          this.config.did,
          this.config.privateKey
        );
        Object.assign(headers, authHeaders);
      } catch (error) {
        if (this.config.debug) {
          console.log('ERROR generating auth headers:', error);
        }
        throw error;
      }
    }

    // Add idempotency key if provided
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    if (this.config.debug) {
      // Redact sensitive headers for logging
      const safeHeaders = { ...headers };
      if (safeHeaders['X-Sig']) safeHeaders['X-Sig'] = '[REDACTED]';
      console.log(`${method} ${path}`, { body, headers: safeHeaders });
    }

    // Make request
    const response = await this.httpClient.request<T>({
      method,
      url,
      headers,
      body: bodyStr || undefined,
      timeout: this.config.timeout,
    });

    if (this.config.debug) {
      console.log(`${method} ${path} response:`, response);
    }

    return response;
  }

  /**
   * Make authenticated API request with automatic 402 payment handling
   *
   * @internal
   * @deprecated This method is no longer used. HttpClient now handles autopay automatically.
   */
  async requestWithPayment<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<APIResponse<T>> {
    console.warn(
      '[Xache] DEPRECATION: requestWithPayment() is deprecated. ' +
      'Use request() instead - autopay is now handled automatically.'
    );
    // Autopay is now handled automatically by HttpClient
    return await this.request<T>(method, path, body);
  }

  /**
   * Get client configuration (read-only)
   */
  getConfig(): Readonly<Required<Omit<XacheClientConfig, 'privateKey' | 'signer' | 'walletProvider' | 'paymentProvider' | 'retryPolicy' | 'cache' | 'autoContribute'>> & {
    privateKey?: string;
    signer?: import('./types').XacheSigner;
    walletProvider?: import('./types').XacheWalletProvider;
    paymentProvider?: PaymentProviderConfig;
    retryPolicy?: RetryPolicy;
    cache?: CacheConfig;
    autoContribute?: AutoContributeConfig;
  }> {
    return this.config;
  }

  /**
   * Get the client's DID
   */
  getDID(): DID {
    return this.config.did;
  }

  /**
   * Get auto-contribute service for direct control
   * Returns undefined if auto-contribute is not configured
   */
  getAutoContributeService() {
    return this.extraction.getAutoContributeService();
  }

  /**
   * Get payment handler (only available if privateKey was provided)
   *
   * @internal
   */
  getPaymentHandler(): PaymentHandler | undefined {
    return this.paymentHandler;
  }

  // ========== Subject Keys Methods (Multi-tenant Memory Isolation) ==========

  /**
   * Derive a pseudonymous subject ID for multi-tenant memory isolation.
   *
   * Uses HMAC-SHA256 to create an irreversible, deterministic identifier from
   * a raw subject identifier (customer ID, user ID, etc.). The server never
   * sees the raw identifier, preserving privacy.
   *
   * @param rawSubjectId - Raw subject identifier (e.g., customer ID, user email)
   * @param options - Optional derivation configuration
   * @returns 64-character hex string (pseudonymous subject ID)
   *
   * @example
   * ```typescript
   * // Derive subject ID from customer ID
   * const subjectId = await client.deriveSubjectId('customer_12345');
   *
   * // Store memory scoped to this subject
   * await client.memory.store({
   *   data: { preference: 'dark_mode' },
   *   storageTier: 'hot',
   *   context: 'user-preferences',
   *   subject: {
   *     subjectId,
   *     scope: 'SUBJECT',
   *   },
   * });
   * ```
   */
  async deriveSubjectId(
    rawSubjectId: string,
    options?: SubjectDerivationOptions
  ): Promise<SubjectId> {
    // Use the encryption key derived from privateKey as the HMAC key
    const encryptionKey = await this.memory.getCurrentEncryptionKey();
    return deriveSubjectIdCrypto(encryptionKey, rawSubjectId, options);
  }

  /**
   * Batch derive subject IDs for multiple raw identifiers.
   * More efficient than calling deriveSubjectId multiple times.
   *
   * @param rawSubjectIds - Array of raw subject identifiers
   * @param options - Optional derivation configuration
   * @returns Map of raw ID to derived subject ID
   *
   * @example
   * ```typescript
   * const subjectIds = await client.batchDeriveSubjectIds([
   *   'customer_001',
   *   'customer_002',
   *   'customer_003',
   * ]);
   *
   * for (const [rawId, subjectId] of subjectIds) {
   *   console.log(`${rawId} => ${subjectId}`);
   * }
   * ```
   */
  async batchDeriveSubjectIds(
    rawSubjectIds: string[],
    options?: SubjectDerivationOptions
  ): Promise<Map<string, SubjectId>> {
    const encryptionKey = await this.memory.getCurrentEncryptionKey();
    return batchDeriveSubjectIdsCrypto(encryptionKey, rawSubjectIds, options);
  }

  /**
   * Create a SUBJECT-scoped context for per-subject memory isolation.
   *
   * @param subjectId - HMAC-derived subject identifier (from deriveSubjectId)
   * @param tenantId - Optional tenant identifier for enterprise multi-tenancy
   * @returns Subject context for SUBJECT scope
   *
   * @example
   * ```typescript
   * const subjectId = await client.deriveSubjectId('customer_12345');
   * const context = client.createSubjectContext(subjectId);
   *
   * await client.memory.store({
   *   data: { key: 'value' },
   *   storageTier: 'hot',
   *   subject: context,
   * });
   * ```
   */
  createSubjectContext(subjectId: SubjectId, tenantId?: string): SubjectContext {
    return createSubjectContextUtil(subjectId, tenantId);
  }

  /**
   * Create a SEGMENT-scoped context for group-level memory sharing.
   *
   * @param segmentId - Segment identifier (e.g., "enterprise", "premium")
   * @param tenantId - Optional tenant identifier for enterprise multi-tenancy
   * @returns Subject context for SEGMENT scope
   *
   * @example
   * ```typescript
   * const context = client.createSegmentContext('enterprise-users');
   *
   * await client.memory.store({
   *   data: { announcement: 'New feature available' },
   *   storageTier: 'hot',
   *   subject: context,
   * });
   * ```
   */
  createSegmentContext(segmentId: string, tenantId?: string): SubjectContext {
    return createSegmentContextUtil(segmentId, tenantId);
  }

  /**
   * Create a GLOBAL-scoped context for agent-wide memories.
   *
   * @param tenantId - Optional tenant identifier for enterprise multi-tenancy
   * @returns Subject context for GLOBAL scope
   *
   * @example
   * ```typescript
   * const context = client.createGlobalContext();
   *
   * await client.memory.store({
   *   data: { agentConfig: { version: '1.0' } },
   *   storageTier: 'hot',
   *   subject: context,
   * });
   * ```
   */
  createGlobalContext(tenantId?: string): SubjectContext {
    return createGlobalContextUtil(tenantId);
  }
}
