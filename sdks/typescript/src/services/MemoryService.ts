/**
 * Memory Service
 * Store, retrieve, and delete encrypted memories per LLD §2.4
 */

import type { XacheClient } from '../XacheClient';
import type {
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
  StorageTier,
  SubjectContext,
} from '../types';
import { encryptData, decryptData, generateKey } from '../crypto/encryption';
import sodium from 'libsodium-wrappers';
import {
  MemoryHelpers,
  type UserPreference,
  type ErrorFix,
  type Pattern,
  type ConversationSummary,
  type ToolConfig,
  type DomainHeuristic,
  type OptimizationInsight,
} from './MemoryHelpers';

/**
 * Memory service for encrypted data storage
 */
export class MemoryService {
  private encryptionKey: string | null = null;
  private encryptionKeyPromise: Promise<string> | null = null;
  private helpers: MemoryHelpers;

  constructor(private readonly client: XacheClient) {
    // Encryption key is lazily initialized on first use
    this.helpers = new MemoryHelpers(this);
  }

  /**
   * Store encrypted memory per LLD §2.4
   * Cost: $0.001 (automatic 402 payment)
   *
   * @example
   * ```typescript
   * const memory = await client.memory.store({
   *   data: { key: 'value', nested: { data: 123 } },
   *   context: 'user-preferences',
   *   tags: ['important'],
   * });
   *
   * console.log('Storage Key:', memory.storageKey);
   * ```
   */
  async store(request: StoreMemoryRequest): Promise<StoreMemoryResponse> {
    await sodium.ready;

    // Validate request
    this.validateStoreRequest(request);

    // Get encryption key
    const key = await this.getEncryptionKey();

    // Encrypt payload (the actual data)
    const encrypted = await encryptData(request.data, key);

    // Validate encrypted size (512B soft limit, 2KB hard limit)
    this.validateEncryptedSize(encrypted.ciphertext);

    // Create minimal pattern intelligence structure (encrypted)
    const patterns = {
      extracted: [],
      contributed: [],
      quality: 0,
      domain: request.context || 'general',
    };
    const encryptedPatterns = await encryptData(patterns, key);

    // Generate unique storage key
    const storageKey = this.generateStorageKey();

    // Calculate checksum (SHA-256 of encrypted payload)
    const payloadBytes = sodium.from_base64(encrypted.ciphertext);
    const checksumBytes = sodium.crypto_generichash(32, payloadBytes);
    const checksum = sodium.to_hex(checksumBytes);

    // Prepare API request per backend contract
    // Include Subject Keys fields for multi-tenant memory isolation
    const apiRequest: Record<string, unknown> = {
      storageKey,
      encryptedPayload: encrypted.ciphertext,
      encryptedPatterns: encryptedPatterns.ciphertext,
      encryptionNonce: encrypted.nonce,
      checksum,
      storageTier: request.storageTier, // Pass requested tier to backend
      context: request.context,
      tags: request.tags,
      metadata: request.metadata,
      expiresAt: request.expiresAt,
    };

    // Add anchoring tier if immediate anchoring requested
    if (request.anchoring === 'immediate') {
      apiRequest.anchoring = 'immediate';
    }

    // Add Subject Keys fields if provided
    // Support both subject object and deprecated flat fields
    if (request.subject) {
      apiRequest.subjectId = request.subject.subjectId;
      apiRequest.scope = request.subject.scope;
      apiRequest.segmentId = request.subject.segmentId;
      apiRequest.tenantId = request.subject.tenantId;
    } else if (request.subjectId || request.scope || request.segmentId || request.tenantId) {
      // Support deprecated flat fields for backwards compatibility
      console.warn(
        '[Xache] DEPRECATION: Flat subject fields (subjectId, scope, segmentId, tenantId) are deprecated. ' +
        'Use the "subject" object instead: { subject: { subjectId, scope, segmentId, tenantId } }'
      );
      apiRequest.subjectId = request.subjectId;
      apiRequest.scope = request.scope;
      apiRequest.segmentId = request.segmentId;
      apiRequest.tenantId = request.tenantId;
    }

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<{
      storageKey: string;
      storageTier: string;
      size: number;
      receiptId: string;
    }>(
      'POST',
      '/v1/memory/store',
      apiRequest
    );

    if (!response.success || !response.data) {
      throw new Error('Memory store failed');
    }

    return {
      storageKey: response.data.storageKey,
      storageTier: response.data.storageTier as any,
      size: response.data.size,
      receiptId: response.data.receiptId,
    };
  }

  /**
   * Retrieve encrypted memory per LLD §2.4
   * Cost: $0.0005 (automatic 402 payment)
   *
   * @example
   * ```typescript
   * const memory = await client.memory.retrieve({
   *   storageKey: 'mem_abc123_xyz',
   * });
   *
   * console.log('Data:', memory.data);
   * ```
   */
  async retrieve(request: RetrieveMemoryRequest): Promise<RetrieveMemoryResponse> {
    await sodium.ready;

    // Validate request
    if (!request.storageKey) {
      throw new Error('storageKey is required');
    }

    // Build request body with Subject Keys fields for access control
    const requestBody: Record<string, unknown> = {
      storageKey: request.storageKey,
    };

    // Add anchoring tier if immediate anchoring requested
    if (request.anchoring === 'immediate') {
      requestBody.anchoring = 'immediate';
    }

    // Add Subject Keys fields if provided (for access control validation)
    // For retrieval, we use SubjectRetrievalContext which doesn't have scope
    // (we filter by subjectId and optionally include segment/global)
    if (request.subject) {
      requestBody.subjectId = request.subject.subjectId;
      requestBody.includeSegment = request.subject.includeSegment;
      requestBody.includeGlobal = request.subject.includeGlobal;
      requestBody.segmentId = request.subject.segmentId;
      requestBody.tenantId = request.subject.tenantId;
    }

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<{
      storageKey: string;
      encryptedPayload: string;
      encryptionNonce: string;
      storageTier: string;
      metadata?: Record<string, unknown>;
      receiptId: string;
    }>(
      'POST',
      '/v1/memory/retrieve',
      requestBody
    );

    if (!response.success || !response.data) {
      throw new Error('Memory retrieve failed');
    }

    // Get encryption key
    const key = await this.getEncryptionKey();

    // Decrypt data client-side using the nonce from the response
    const encrypted = {
      ciphertext: response.data.encryptedPayload,
      nonce: response.data.encryptionNonce,
    };

    const decryptedData = await decryptData(encrypted, key);

    return {
      storageKey: response.data.storageKey,
      data: decryptedData,
      storageTier: response.data.storageTier as any,
      metadata: response.data.metadata,
      receiptId: response.data.receiptId,
    };
  }

  /**
   * Delete memory per LLD §2.4
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const result = await client.memory.delete('mem_abc123_xyz');
   * console.log('Deleted:', result.deleted);
   * ```
   */
  async delete(storageKey: string): Promise<{ storageKey: string; deleted: boolean }> {
    // Validate storageKey
    if (!storageKey) {
      throw new Error('storageKey is required');
    }

    // Make API request (authenticated, no payment)
    const response = await this.client.request<{ storageKey: string; deleted: boolean }>(
      'DELETE',
      `/v1/memory/${storageKey}`
    );

    if (!response.success || !response.data) {
      throw new Error('Memory delete failed');
    }

    return response.data;
  }

  /**
   * List memories for authenticated agent
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * // List all memories
   * const result = await client.memory.list();
   * console.log('Total:', result.total);
   *
   * // List with filters
   * const filtered = await client.memory.list({
   *   context: 'user-preferences',
   *   tier: 'hot',
   *   limit: 10,
   * });
   * ```
   */
  async list(request?: ListMemoriesRequest): Promise<ListMemoriesResponse> {
    // Build query params
    const params = new URLSearchParams();
    if (request?.context) params.set('context', request.context);
    if (request?.tier) params.set('tier', request.tier);
    if (request?.limit) params.set('limit', String(request.limit));
    if (request?.offset) params.set('offset', String(request.offset));
    if (request?.sortBy) params.set('sortBy', request.sortBy);

    // Add Subject Keys filters for multi-tenant memory isolation
    if (request?.subjectId) params.set('subjectId', request.subjectId);
    if (request?.scope) params.set('scope', request.scope);
    if (request?.segmentId) params.set('segmentId', request.segmentId);
    if (request?.tenantId) params.set('tenantId', request.tenantId);

    const query = params.toString();
    const url = `/v1/memory${query ? '?' + query : ''}`;

    // Make API request (authenticated, no payment)
    const response = await this.client.request<ListMemoriesResponse>(
      'GET',
      url
    );

    if (!response.success || !response.data) {
      throw new Error('Memory list failed');
    }

    return response.data;
  }

  /**
   * Batch store encrypted memories per PRD FR-010, LLD §2.3
   * Max 100 items per batch
   * Cost: Single 402 payment for entire batch
   *
   * @example
   * ```typescript
   * const result = await client.memory.storeBatch({
   *   items: [
   *     { data: { key: 'value1' }, storageTier: 'hot' },
   *     { data: { key: 'value2' }, storageTier: 'warm' },
   *     { data: { key: 'value3' }, storageTier: 'cold' },
   *   ]
   * });
   *
   * console.log('Success:', result.successCount, 'Failed:', result.failureCount);
   * result.results.forEach(r => {
   *   if (r.memoryId) {
   *     console.log('Stored:', r.memoryId);
   *   } else {
   *     console.log('Failed:', r.error);
   *   }
   * });
   * ```
   */
  async storeBatch(request: BatchStoreMemoryRequest): Promise<BatchStoreMemoryResponse> {
    await sodium.ready;

    // Validate batch request
    if (!request.items || !Array.isArray(request.items)) {
      throw new Error('items must be an array');
    }

    if (request.items.length === 0) {
      throw new Error('items array cannot be empty');
    }

    if (request.items.length > 100) {
      throw new Error('batch size exceeds maximum of 100 items');
    }

    // Validate each item
    request.items.forEach((item, index) => {
      try {
        this.validateStoreRequest(item);
      } catch (error) {
        throw new Error(`Invalid item at index ${index}: ${(error as Error).message}`);
      }
    });

    // Get encryption key
    const key = await this.getEncryptionKey();

    // Encrypt all items client-side with proper format
    const encryptedItems = await Promise.all(
      request.items.map(async (item) => {
        // Encrypt payload
        const encrypted = await encryptData(item.data, key);

        // Create minimal pattern intelligence structure (encrypted)
        const patterns = {
          extracted: [],
          contributed: [],
          quality: 0,
          domain: item.context || 'general',
        };
        const encryptedPatterns = await encryptData(patterns, key);

        // Generate unique storage key
        const storageKey = this.generateStorageKey();

        // Calculate checksum
        const payloadBytes = sodium.from_base64(encrypted.ciphertext);
        const checksumBytes = sodium.crypto_generichash(32, payloadBytes);
        const checksum = sodium.to_hex(checksumBytes);

        // Build item with Subject Keys fields for multi-tenant isolation
        const encryptedItem: Record<string, unknown> = {
          storageKey,
          encryptedPayload: encrypted.ciphertext,
          encryptedPatterns: encryptedPatterns.ciphertext,
          encryptionNonce: encrypted.nonce,
          checksum,
          storageTier: item.storageTier, // Pass requested tier to backend
          context: item.context,
          tags: item.tags,
          metadata: item.metadata,
          expiresAt: item.expiresAt,
        };

        // Add Subject Keys fields if provided
        // Support both subject object and deprecated flat fields
        if (item.subject) {
          encryptedItem.subjectId = item.subject.subjectId;
          encryptedItem.scope = item.subject.scope;
          encryptedItem.segmentId = item.subject.segmentId;
          encryptedItem.tenantId = item.subject.tenantId;
        } else if (item.subjectId || item.scope || item.segmentId || item.tenantId) {
          // Support deprecated flat fields for backwards compatibility
          console.warn(
            '[Xache] DEPRECATION: Flat subject fields (subjectId, scope, segmentId, tenantId) are deprecated. ' +
            'Use the "subject" object instead: { subject: { subjectId, scope, segmentId, tenantId } }'
          );
          encryptedItem.subjectId = item.subjectId;
          encryptedItem.scope = item.scope;
          encryptedItem.segmentId = item.segmentId;
          encryptedItem.tenantId = item.tenantId;
        }

        return encryptedItem;
      })
    );

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<BatchStoreMemoryResponse>(
      'POST',
      '/v1/memory/store/batch',
      { items: encryptedItems }
    );

    if (!response.success || !response.data) {
      throw new Error('Batch memory store failed');
    }

    return response.data;
  }

  /**
   * Batch retrieve encrypted memories per PRD FR-011, LLD §2.3
   * Max 100 items per batch
   * Cost: Single 402 payment for entire batch
   *
   * @example
   * ```typescript
   * const result = await client.memory.retrieveBatch({
   *   memoryIds: ['mem_abc123', 'mem_def456', 'mem_ghi789']
   * });
   *
   * console.log('Success:', result.successCount, 'Failed:', result.failureCount);
   * result.results.forEach(r => {
   *   if (r.data) {
   *     console.log('Retrieved:', r.memoryId, r.data);
   *   } else {
   *     console.log('Failed:', r.error);
   *   }
   * });
   * ```
   */
  async retrieveBatch(request: BatchRetrieveMemoryRequest): Promise<BatchRetrieveMemoryResponse> {
    await sodium.ready;

    // Validate batch request
    if (!request.storageKeys || !Array.isArray(request.storageKeys)) {
      throw new Error('storageKeys must be an array');
    }

    if (request.storageKeys.length === 0) {
      throw new Error('storageKeys array cannot be empty');
    }

    if (request.storageKeys.length > 100) {
      throw new Error('batch size exceeds maximum of 100 items');
    }

    // Validate each storageKey
    request.storageKeys.forEach((key, index) => {
      if (!key || typeof key !== 'string') {
        throw new Error(`Invalid storageKey at index ${index}`);
      }
    });

    // Make API request with automatic 402 payment
    const response = await this.client.requestWithPayment<{
      results: Array<{
        index: number;
        storageKey?: string;
        encryptedPayload?: string;
        encryptionNonce?: string;
        storageTier?: StorageTier;
        metadata?: Record<string, unknown>;
        receiptId?: string;
        error?: string;
      }>;
      successCount: number;
      failureCount: number;
      batchReceiptId: string;
    }>(
      'POST',
      '/v1/memory/retrieve/batch',
      { storageKeys: request.storageKeys }
    );

    if (!response.success || !response.data) {
      throw new Error('Batch memory retrieve failed');
    }

    // Get encryption key
    const key = await this.getEncryptionKey();

    // Decrypt all successfully retrieved items
    const results = await Promise.all(
      response.data.results.map(async (result) => {
        // If retrieval failed, return error as-is
        if (result.error || !result.encryptedPayload || !result.encryptionNonce) {
          return {
            index: result.index,
            storageKey: result.storageKey,
            error: result.error || 'No data returned',
          };
        }

        // Decrypt the data
        try {
          const encrypted = {
            ciphertext: result.encryptedPayload,
            nonce: result.encryptionNonce,
          };
          const decryptedData = await decryptData(encrypted, key);

          return {
            index: result.index,
            storageKey: result.storageKey,
            data: decryptedData,
            storageTier: result.storageTier,
            metadata: result.metadata,
            receiptId: result.receiptId,
          };
        } catch (error) {
          return {
            index: result.index,
            storageKey: result.storageKey,
            error: `Decryption failed: ${(error as Error).message}`,
          };
        }
      })
    );

    return {
      results,
      successCount: response.data.successCount,
      failureCount: response.data.failureCount,
      batchReceiptId: response.data.batchReceiptId,
    };
  }

  /**
   * Validate store request (basic checks only, size validated after encryption)
   */
  private validateStoreRequest(request: StoreMemoryRequest): void {
    if (!request.data || typeof request.data !== 'object') {
      throw new Error('data must be a non-null object');
    }

    if (!request.storageTier || !['hot', 'warm', 'cold'].includes(request.storageTier)) {
      throw new Error('storageTier must be "hot", "warm", or "cold"');
    }

    // Note: Size validation happens after encryption in store() method
  }

  /**
   * Validate encrypted payload size
   * Target: 512 bytes (soft limit, warning)
   * Hard cap: 2048 bytes (reject)
   */
  private validateEncryptedSize(ciphertext: string): void {
    const encryptedBytes = sodium.from_base64(ciphertext);
    const size = encryptedBytes.length;

    // Soft limit: warn if over 512 bytes
    if (size > 512 && size <= 2048) {
      console.warn(
        `[Xache] Memory payload is ${size} bytes encrypted (recommended: ≤512 bytes). ` +
        `Consider storing summarized patterns instead of raw data for optimal performance.`
      );
    }

    // Hard limit: reject if over 2KB
    if (size > 2048) {
      throw new Error(
        `Memory payload too large: ${size} bytes encrypted (max 2048 bytes). ` +
        `Xache is designed for pattern-level memory, not raw logs. ` +
        `Please store a summarized version (target: ≤512 bytes).`
      );
    }
  }

  /**
   * Get or initialize encryption key
   */
  private async getEncryptionKey(): Promise<string> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // Prevent concurrent initialization
    if (this.encryptionKeyPromise) {
      return this.encryptionKeyPromise;
    }

    this.encryptionKeyPromise = this.deriveEncryptionKey();
    this.encryptionKey = await this.encryptionKeyPromise;
    return this.encryptionKey;
  }

  /**
   * Derive encryption key from client configuration using libsodium
   * Uses BLAKE2b hash function for deterministic key derivation
   */
  private async deriveEncryptionKey(): Promise<string> {
    await sodium.ready;

    const config = this.client.getConfig();

    // Derive key from private key and DID using BLAKE2b
    const keyMaterial = config.privateKey + config.did;
    const keyMaterialBytes = new TextEncoder().encode(keyMaterial);

    // Use crypto_generichash (BLAKE2b) for deterministic key derivation
    const key = sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, keyMaterialBytes);

    return sodium.to_base64(key);
  }

  /**
   * Set custom encryption key
   * Useful for testing or using external key management
   */
  setEncryptionKey(key: string): void {
    (this as any).encryptionKey = key;
  }

  /**
   * Get current encryption key (for backup purposes)
   */
  async getCurrentEncryptionKey(): Promise<string> {
    return await this.getEncryptionKey();
  }

  /**
   * Generate unique storage key
   * Format: mem_{timestamp}_{random}
   */
  private generateStorageKey(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `mem_${timestamp}_${random}`;
  }

  // ========== Helper Methods (SDK Sugar) ==========

  /**
   * Remember a user preference (SDK helper)
   * @see MemoryHelpers.rememberPreference
   */
  async rememberPreference(pref: UserPreference): Promise<string> {
    return this.helpers.rememberPreference(pref);
  }

  /**
   * Remember an error fix (SDK helper)
   * @see MemoryHelpers.rememberFix
   */
  async rememberFix(fix: ErrorFix): Promise<string> {
    return this.helpers.rememberFix(fix);
  }

  /**
   * Remember a pattern (SDK helper)
   * @see MemoryHelpers.rememberPattern
   */
  async rememberPattern(pattern: Pattern): Promise<string> {
    return this.helpers.rememberPattern(pattern);
  }

  /**
   * Remember a conversation summary (SDK helper)
   * @see MemoryHelpers.rememberConversation
   */
  async rememberConversation(conv: ConversationSummary): Promise<string> {
    return this.helpers.rememberConversation(conv);
  }

  /**
   * Remember a tool configuration (SDK helper)
   * @see MemoryHelpers.rememberToolConfig
   */
  async rememberToolConfig(tool: ToolConfig): Promise<string> {
    return this.helpers.rememberToolConfig(tool);
  }

  /**
   * Remember a domain heuristic (SDK helper)
   * @see MemoryHelpers.rememberHeuristic
   */
  async rememberHeuristic(heuristic: DomainHeuristic): Promise<string> {
    return this.helpers.rememberHeuristic(heuristic);
  }

  /**
   * Remember an optimization insight (SDK helper)
   * @see MemoryHelpers.rememberOptimization
   */
  async rememberOptimization(insight: OptimizationInsight): Promise<string> {
    return this.helpers.rememberOptimization(insight);
  }

  /**
   * Recall all user preferences (SDK helper)
   * @see MemoryHelpers.recallPreferences
   */
  async recallPreferences(opts?: { limit?: number }) {
    return this.helpers.recallPreferences(opts);
  }

  /**
   * Recall error fixes (SDK helper)
   * @see MemoryHelpers.recallFixes
   */
  async recallFixes(opts?: { domain?: string; limit?: number }) {
    return this.helpers.recallFixes(opts);
  }

  /**
   * Recall patterns (SDK helper)
   * @see MemoryHelpers.recallPatterns
   */
  async recallPatterns(opts?: { success?: boolean; limit?: number }) {
    return this.helpers.recallPatterns(opts);
  }
}
