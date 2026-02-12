/**
 * Unit tests for Cognitive Fingerprint Generation
 *
 * Tests cover:
 * - Key derivation determinism
 * - Concept extraction (TF heuristic)
 * - Category classification (keyword-based)
 * - Topic hash generation
 * - Embedding generation (hash-based random projection)
 * - Full fingerprint generation
 * - Edge cases (empty input, unicode, nested objects)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';

import {
  generateFingerprint,
  deriveCogSalt,
  deriveProjectionSeed,
  generateTopicHashes,
  extractConcepts,
  classifyCategory,
  flattenToText,
  generateEmbedding64,
} from './fingerprint';
import type { CognitiveCategory, CognitiveFingerprint } from './fingerprint';

// Deterministic test key (base64-encoded 32-byte key — NOT real, safe to commit)
const TEST_KEY = sodium.to_base64(new Uint8Array(32).fill(42));

beforeAll(async () => {
  await sodium.ready;
});

// =============================================================================
// flattenToText
// =============================================================================

describe('flattenToText', () => {
  it('should return string as-is', () => {
    expect(flattenToText('hello world')).toBe('hello world');
  });

  it('should stringify numbers and booleans', () => {
    expect(flattenToText(42)).toBe('42');
    expect(flattenToText(true)).toBe('true');
  });

  it('should return empty string for null/undefined', () => {
    expect(flattenToText(null)).toBe('');
    expect(flattenToText(undefined)).toBe('');
  });

  it('should flatten arrays', () => {
    expect(flattenToText(['a', 'b', 'c'])).toBe('a b c');
  });

  it('should flatten objects with keys and values', () => {
    const result = flattenToText({ name: 'Alice', age: 30 });
    expect(result).toContain('name');
    expect(result).toContain('Alice');
    expect(result).toContain('age');
    expect(result).toContain('30');
  });

  it('should handle nested structures', () => {
    const result = flattenToText({ user: { name: 'Bob', tags: ['admin', 'dev'] } });
    expect(result).toContain('Bob');
    expect(result).toContain('admin');
    expect(result).toContain('dev');
  });
});

// =============================================================================
// extractConcepts
// =============================================================================

describe('extractConcepts', () => {
  it('should extract top terms by frequency', () => {
    const concepts = extractConcepts(
      'The database migration failed. The database was updated but migration rolled back.',
    );
    expect(concepts).toContain('database');
    expect(concepts).toContain('migration');
  });

  it('should filter stopwords', () => {
    const concepts = extractConcepts('the is a an and or but for to');
    expect(concepts).toHaveLength(0);
  });

  it('should filter short tokens (length <= 2)', () => {
    const concepts = extractConcepts('go to db in on at');
    expect(concepts).toHaveLength(0);
  });

  it('should respect maxConcepts limit', () => {
    const concepts = extractConcepts(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet',
      3,
    );
    expect(concepts.length).toBeLessThanOrEqual(3);
  });

  it('should handle object input', () => {
    const concepts = extractConcepts({ preference: 'dark mode', language: 'typescript' });
    expect(concepts.length).toBeGreaterThan(0);
  });

  it('should return empty for empty input', () => {
    expect(extractConcepts('')).toHaveLength(0);
    expect(extractConcepts(null)).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    const lower = extractConcepts('Database Migration');
    const upper = extractConcepts('DATABASE MIGRATION');
    expect(lower).toEqual(upper);
  });
});

// =============================================================================
// classifyCategory
// =============================================================================

describe('classifyCategory', () => {
  it('should classify preference data', () => {
    expect(classifyCategory('I prefer dark mode and like monospace fonts')).toBe('preference');
  });

  it('should classify fact data', () => {
    expect(classifyCategory('My email address is alice@example.com and my birthday is March 5')).toBe('fact');
  });

  it('should classify event data', () => {
    expect(classifyCategory('A meeting happened yesterday about the outage incident')).toBe('event');
  });

  it('should classify procedure data', () => {
    expect(classifyCategory('Step 1: install dependencies. Step 2: configure the pipeline and build')).toBe('procedure');
  });

  it('should classify goal data', () => {
    expect(classifyCategory('Our goal is to achieve the milestone by the deadline')).toBe('goal');
  });

  it('should classify constraint data', () => {
    expect(classifyCategory('The budget limit must not exceed the max requirement')).toBe('constraint');
  });

  it('should classify reference data', () => {
    expect(classifyCategory('See the API spec document at the github repo endpoint')).toBe('reference');
  });

  it('should classify feedback data', () => {
    expect(classifyCategory('The review score and evaluation suggest quality improvement needed')).toBe('feedback');
  });

  it('should return unknown for ambiguous text', () => {
    expect(classifyCategory('xyz abc 123')).toBe('unknown');
  });

  it('should use context hint for classification', () => {
    // "colors" alone might not classify, but with preference context it should help
    const result = classifyCategory('blue and red', 'prefer these colors style theme');
    expect(result).toBe('preference');
  });
});

// =============================================================================
// Key Derivation
// =============================================================================

describe('Key Derivation', () => {
  it('deriveCogSalt should return 32 bytes', () => {
    const salt = deriveCogSalt(TEST_KEY);
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(32);
  });

  it('deriveProjectionSeed should return 32 bytes', () => {
    const seed = deriveProjectionSeed(TEST_KEY);
    expect(seed).toBeInstanceOf(Uint8Array);
    expect(seed.length).toBe(32);
  });

  it('should be deterministic — same key produces same salt', () => {
    const salt1 = deriveCogSalt(TEST_KEY);
    const salt2 = deriveCogSalt(TEST_KEY);
    expect(salt1).toEqual(salt2);
  });

  it('should be deterministic — same key produces same projection seed', () => {
    const seed1 = deriveProjectionSeed(TEST_KEY);
    const seed2 = deriveProjectionSeed(TEST_KEY);
    expect(seed1).toEqual(seed2);
  });

  it('cogSalt and projectionSeed should differ (domain separation)', () => {
    const salt = deriveCogSalt(TEST_KEY);
    const seed = deriveProjectionSeed(TEST_KEY);
    expect(salt).not.toEqual(seed);
  });

  it('different keys should produce different salts', () => {
    const key2 = sodium.to_base64(new Uint8Array(32).fill(99));
    const salt1 = deriveCogSalt(TEST_KEY);
    const salt2 = deriveCogSalt(key2);
    expect(salt1).not.toEqual(salt2);
  });
});

// =============================================================================
// Topic Hashes
// =============================================================================

describe('generateTopicHashes', () => {
  const cogSalt = deriveCogSalt(TEST_KEY);

  it('should produce hex strings', () => {
    const hashes = generateTopicHashes(['database', 'migration'], cogSalt);
    expect(hashes).toHaveLength(2);
    for (const h of hashes) {
      expect(h).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
    }
  });

  it('should be deterministic', () => {
    const hashes1 = generateTopicHashes(['database'], cogSalt);
    const hashes2 = generateTopicHashes(['database'], cogSalt);
    expect(hashes1).toEqual(hashes2);
  });

  it('should normalize case', () => {
    const lower = generateTopicHashes(['database'], cogSalt);
    const upper = generateTopicHashes(['DATABASE'], cogSalt);
    expect(lower).toEqual(upper);
  });

  it('should trim whitespace', () => {
    const clean = generateTopicHashes(['database'], cogSalt);
    const padded = generateTopicHashes(['  database  '], cogSalt);
    expect(clean).toEqual(padded);
  });

  it('different concepts should produce different hashes', () => {
    const [h1] = generateTopicHashes(['database'], cogSalt);
    const [h2] = generateTopicHashes(['network'], cogSalt);
    expect(h1).not.toBe(h2);
  });

  it('different salts should produce different hashes', () => {
    const otherKey = sodium.to_base64(new Uint8Array(32).fill(99));
    const otherSalt = deriveCogSalt(otherKey);
    const [h1] = generateTopicHashes(['database'], cogSalt);
    const [h2] = generateTopicHashes(['database'], otherSalt);
    expect(h1).not.toBe(h2);
  });
});

// =============================================================================
// Embedding Generation
// =============================================================================

describe('generateEmbedding64', () => {
  const projSeed = deriveProjectionSeed(TEST_KEY);

  it('should return exactly 64 dimensions', () => {
    const emb = generateEmbedding64('hello world test embedding', projSeed);
    expect(emb).toHaveLength(64);
  });

  it('should return all zeros for empty text', () => {
    const emb = generateEmbedding64('', projSeed);
    expect(emb).toHaveLength(64);
    expect(emb.every(v => v === 0)).toBe(true);
  });

  it('should be L2-normalized (unit vector)', () => {
    const emb = generateEmbedding64('the quick brown fox jumps over the lazy dog', projSeed);
    const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('should be deterministic', () => {
    const emb1 = generateEmbedding64('same text same result', projSeed);
    const emb2 = generateEmbedding64('same text same result', projSeed);
    expect(emb1).toEqual(emb2);
  });

  it('similar texts should produce similar embeddings (cosine > 0.3)', () => {
    const emb1 = generateEmbedding64('the user prefers dark mode theme', projSeed);
    const emb2 = generateEmbedding64('user likes dark mode color theme', projSeed);
    const cosine = emb1.reduce((sum, v, i) => sum + v * emb2[i], 0);
    // Hash-based embeddings are coarse, so threshold is modest
    expect(cosine).toBeGreaterThan(0.3);
  });

  it('dissimilar texts should produce less similar embeddings', () => {
    const emb1 = generateEmbedding64('the user prefers dark mode theme', projSeed);
    const emb2 = generateEmbedding64('quantum mechanics wave function collapse', projSeed);
    const cosine = emb1.reduce((sum, v, i) => sum + v * emb2[i], 0);
    // Should be less similar than the similar-text case
    expect(cosine).toBeLessThan(0.5);
  });

  it('different projection seeds should produce incomparable embeddings', () => {
    const otherKey = sodium.to_base64(new Uint8Array(32).fill(99));
    const otherSeed = deriveProjectionSeed(otherKey);

    const emb1 = generateEmbedding64('same text', projSeed);
    const emb2 = generateEmbedding64('same text', otherSeed);

    // Should not be equal
    expect(emb1).not.toEqual(emb2);
  });
});

// =============================================================================
// Full Fingerprint Generation
// =============================================================================

describe('generateFingerprint', () => {
  it('should produce a valid fingerprint', async () => {
    const fp = await generateFingerprint(
      'The user prefers dark mode and likes TypeScript',
      TEST_KEY,
    );

    expect(fp.topicHashes).toBeInstanceOf(Array);
    expect(fp.topicHashes.length).toBeGreaterThan(0);
    expect(fp.topicHashes.length).toBeLessThanOrEqual(5);

    expect(fp.category).toBe('preference');

    expect(fp.embedding64).toHaveLength(64);
    const norm = Math.sqrt(fp.embedding64.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);

    expect(fp.temporalWeight).toBe(1.0);
    expect(fp.version).toBe(1);
  });

  it('should be deterministic for same input and key', async () => {
    const fp1 = await generateFingerprint('test data', TEST_KEY);
    const fp2 = await generateFingerprint('test data', TEST_KEY);
    expect(fp1).toEqual(fp2);
  });

  it('should use context for category classification', async () => {
    const fp = await generateFingerprint(
      'deploy the service to production',
      TEST_KEY,
      'step process procedure',
    );
    expect(fp.category).toBe('procedure');
  });

  it('should handle object data', async () => {
    const fp = await generateFingerprint(
      { name: 'Alice', email: 'alice@example.com', birthday: 'March 5' },
      TEST_KEY,
    );
    expect(fp.topicHashes.length).toBeGreaterThan(0);
    expect(fp.category).toBe('fact');
  });

  it('should handle empty/null data gracefully', async () => {
    const fp = await generateFingerprint('', TEST_KEY);
    expect(fp.topicHashes).toHaveLength(0);
    expect(fp.category).toBe('unknown');
    expect(fp.embedding64).toHaveLength(64);
    expect(fp.embedding64.every(v => v === 0)).toBe(true);
  });

  it('different keys should produce different fingerprints', async () => {
    const key2 = sodium.to_base64(new Uint8Array(32).fill(99));
    const data = 'The database migration process failed during the deployment procedure';
    const fp1 = await generateFingerprint(data, TEST_KEY);
    const fp2 = await generateFingerprint(data, key2);

    // Both should have concepts extracted
    expect(fp1.topicHashes.length).toBeGreaterThan(0);
    expect(fp2.topicHashes.length).toBeGreaterThan(0);

    // Topic hashes should differ (different salt)
    expect(fp1.topicHashes).not.toEqual(fp2.topicHashes);
    // Embeddings should differ (different projection seed)
    expect(fp1.embedding64).not.toEqual(fp2.embedding64);
    // Category should be the same (not key-dependent)
    expect(fp1.category).toBe(fp2.category);
  });
});
