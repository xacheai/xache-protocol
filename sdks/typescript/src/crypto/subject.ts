/**
 * Subject Keys Cryptographic Utilities
 * Based on docs/SUBJECT-KEYS-ARCHITECTURE.md
 *
 * Provides client-side HMAC derivation for pseudonymous subject identification.
 * The server never sees raw subject identifiers (customer IDs, user IDs, etc.).
 */

import sodium from 'libsodium-wrappers';

/**
 * Subject ID type: 64-character hex string (HMAC-SHA512/256 output)
 */
export type SubjectId = string;

/**
 * Memory scope for subject isolation
 */
export type MemoryScope = 'SUBJECT' | 'SEGMENT' | 'GLOBAL';

/**
 * Subject context for memory operations
 */
export interface SubjectContext {
  /** HMAC-derived pseudonymous subject identifier (64 hex chars) */
  subjectId?: SubjectId;
  /** Memory visibility scope */
  scope: MemoryScope;
  /** Segment identifier for SEGMENT-scoped memories */
  segmentId?: string;
  /** Enterprise tenant identifier */
  tenantId?: string;
}

/**
 * Subject derivation options
 */
export interface SubjectDerivationOptions {
  /** Custom domain separator (default: 'xache:subject:v1') */
  domain?: string;
}

/**
 * Ensure libsodium is ready
 */
async function ensureSodiumReady(): Promise<void> {
  await sodium.ready;
}

/**
 * Derives a pseudonymous subject ID using HMAC-SHA512/256.
 *
 * This function creates a deterministic, irreversible identifier from a raw subject ID
 * (such as a customer ID or user ID). The derived subject ID:
 * - Is pseudonymous (cannot be reversed to the original ID)
 * - Is deterministic (same inputs always produce same output)
 * - Is unique per agent (different agents produce different subject IDs)
 * - Is 64 hex characters (256 bits of entropy)
 *
 * @param agentKey - Agent's encryption key (32 bytes, base64)
 * @param rawSubjectId - Raw subject identifier (customer ID, user ID, etc.)
 * @param options - Optional derivation configuration
 * @returns 64-character hex string (pseudonymous subject ID)
 *
 * @example
 * ```typescript
 * const subjectId = await deriveSubjectId(agentKey, 'customer_12345');
 * // Returns: 'a1b2c3d4e5f6...' (64 hex chars)
 * ```
 */
export async function deriveSubjectId(
  agentKey: string,
  rawSubjectId: string,
  options?: SubjectDerivationOptions
): Promise<SubjectId> {
  await ensureSodiumReady();

  // Decode the agent key from base64
  const keyBytes = sodium.from_base64(agentKey);

  if (keyBytes.length !== 32) {
    throw new Error(`Invalid agent key length: expected 32 bytes, got ${keyBytes.length}`);
  }

  // Create domain-separated input to prevent cross-protocol attacks
  const domain = options?.domain ?? 'xache:subject:v1';
  const input = `${domain}:${rawSubjectId}`;
  const inputBytes = new TextEncoder().encode(input);

  // Use HMAC-SHA512/256 (first 256 bits of HMAC-SHA512)
  // This provides 256-bit security while being efficient
  const hmacKey = sodium.crypto_generichash(32, keyBytes, undefined);
  const hmac = sodium.crypto_auth(inputBytes, hmacKey);

  // Convert to hex string (64 characters for 32 bytes)
  return sodium.to_hex(hmac);
}

/**
 * Validates that a subject ID has the correct format.
 *
 * @param subjectId - Subject ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSubjectId(subjectId: string): boolean {
  if (typeof subjectId !== 'string') {
    return false;
  }
  // Must be exactly 64 hex characters
  return /^[a-f0-9]{64}$/.test(subjectId);
}

/**
 * Validates that a scope is valid.
 *
 * @param scope - Scope to validate
 * @returns true if valid, false otherwise
 */
export function isValidScope(scope: string): scope is MemoryScope {
  return scope === 'SUBJECT' || scope === 'SEGMENT' || scope === 'GLOBAL';
}

/**
 * Creates a SUBJECT-scoped context.
 *
 * @param subjectId - HMAC-derived subject identifier
 * @param tenantId - Optional tenant identifier
 * @returns Subject context for SUBJECT scope
 */
export function createSubjectContext(
  subjectId: SubjectId,
  tenantId?: string
): SubjectContext {
  if (!isValidSubjectId(subjectId)) {
    throw new Error('Invalid subject ID format: must be 64 hex characters');
  }
  return {
    subjectId,
    scope: 'SUBJECT',
    tenantId,
  };
}

/**
 * Creates a SEGMENT-scoped context.
 *
 * @param segmentId - Segment identifier
 * @param tenantId - Optional tenant identifier
 * @returns Subject context for SEGMENT scope
 */
export function createSegmentContext(
  segmentId: string,
  tenantId?: string
): SubjectContext {
  if (!segmentId || segmentId.length === 0) {
    throw new Error('Segment ID cannot be empty');
  }
  return {
    segmentId,
    scope: 'SEGMENT',
    tenantId,
  };
}

/**
 * Creates a GLOBAL-scoped context.
 *
 * @param tenantId - Optional tenant identifier
 * @returns Subject context for GLOBAL scope
 */
export function createGlobalContext(tenantId?: string): SubjectContext {
  return {
    scope: 'GLOBAL',
    tenantId,
  };
}

/**
 * Validates a subject context for consistency.
 *
 * @param context - Subject context to validate
 * @throws Error if context is invalid
 */
export function validateSubjectContext(context: SubjectContext): void {
  if (!isValidScope(context.scope)) {
    throw new Error(`Invalid scope: ${context.scope}`);
  }

  if (context.scope === 'SUBJECT') {
    if (!context.subjectId) {
      throw new Error('subjectId is required when scope is SUBJECT');
    }
    if (!isValidSubjectId(context.subjectId)) {
      throw new Error('Invalid subjectId format: must be 64 hex characters');
    }
  }

  if (context.scope === 'SEGMENT') {
    if (!context.segmentId) {
      throw new Error('segmentId is required when scope is SEGMENT');
    }
    if (context.segmentId.length === 0) {
      throw new Error('segmentId cannot be empty');
    }
  }
}

/**
 * Batch derives subject IDs for multiple raw identifiers.
 * More efficient than calling deriveSubjectId multiple times.
 *
 * @param agentKey - Agent's encryption key (32 bytes, base64)
 * @param rawSubjectIds - Array of raw subject identifiers
 * @param options - Optional derivation configuration
 * @returns Map of raw ID to derived subject ID
 */
export async function batchDeriveSubjectIds(
  agentKey: string,
  rawSubjectIds: string[],
  options?: SubjectDerivationOptions
): Promise<Map<string, SubjectId>> {
  await ensureSodiumReady();

  const results = new Map<string, SubjectId>();

  // Decode key once
  const keyBytes = sodium.from_base64(agentKey);
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid agent key length: expected 32 bytes, got ${keyBytes.length}`);
  }

  const domain = options?.domain ?? 'xache:subject:v1';
  const hmacKey = sodium.crypto_generichash(32, keyBytes, undefined);

  for (const rawId of rawSubjectIds) {
    const input = `${domain}:${rawId}`;
    const inputBytes = new TextEncoder().encode(input);
    const hmac = sodium.crypto_auth(inputBytes, hmacKey);
    results.set(rawId, sodium.to_hex(hmac));
  }

  return results;
}
