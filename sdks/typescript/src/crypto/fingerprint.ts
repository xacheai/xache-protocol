/**
 * Cognitive Fingerprint Generation
 * Per docs/xache_cognition.md
 *
 * All computation is client-side. The server never sees plaintext.
 * Generates compact, one-way semantic shadows for zero-knowledge memory probing.
 */

import sodium from 'libsodium-wrappers';

// =============================================================================
// Types
// =============================================================================

export type CognitiveCategory =
  | 'preference' | 'fact' | 'event' | 'procedure' | 'relationship'
  | 'observation' | 'decision' | 'goal' | 'constraint' | 'reference'
  | 'summary' | 'handoff' | 'pattern' | 'feedback' | 'unknown';

export interface CognitiveFingerprint {
  topicHashes: string[];
  category: CognitiveCategory;
  embedding64: number[];
  temporalWeight: number;
  version: number;
}

// =============================================================================
// Key Derivation
// =============================================================================

/**
 * Derive cognitive salt for topic hashing using BLAKE2b keyed hash.
 * Domain-separated to prevent cross-protocol collision.
 */
function deriveCogSalt(encryptionKey: string): Uint8Array {
  const keyBytes = sodium.from_base64(encryptionKey);
  const info = new TextEncoder().encode('xache:cognitive:v1:topic-hash');
  // BLAKE2b-256 keyed hash as HKDF substitute
  return sodium.crypto_generichash(32, info, keyBytes);
}

/**
 * Derive projection seed for embedding matrix using BLAKE2b keyed hash.
 */
function deriveProjectionSeed(encryptionKey: string): Uint8Array {
  const keyBytes = sodium.from_base64(encryptionKey);
  const info = new TextEncoder().encode('xache:projection:v1:embedding-matrix');
  return sodium.crypto_generichash(32, info, keyBytes);
}

// =============================================================================
// Topic Hash Generation
// =============================================================================

/**
 * Generate HMAC-based topic hashes from concepts.
 * Each concept is normalized and hashed with the agent-specific cognitive salt.
 */
function generateTopicHashes(concepts: string[], cogSalt: Uint8Array): string[] {
  return concepts.map(c => {
    const normalized = c.toLowerCase().trim();
    const input = new TextEncoder().encode(normalized);
    // BLAKE2b keyed hash as HMAC substitute
    const hash = sodium.crypto_generichash(32, input, cogSalt);
    return sodium.to_hex(hash);
  });
}

// =============================================================================
// Concept Extraction (V1 — TF-IDF Heuristic, No Model)
// =============================================================================

// Common English stopwords
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
  'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we',
  'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them',
  'their', 'what', 'which', 'who', 'whom', 'null', 'undefined', 'true',
  'false', 'string', 'number', 'object', 'array', 'value', 'key', 'data',
]);

/**
 * Flatten any data structure to a text string for processing.
 */
function flattenToText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (data === null || data === undefined) return '';

  if (Array.isArray(data)) {
    return data.map(flattenToText).join(' ');
  }

  if (typeof data === 'object') {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      parts.push(key);
      parts.push(flattenToText(value));
    }
    return parts.join(' ');
  }

  return String(data);
}

/**
 * Extract key concepts from data using TF heuristic.
 * Returns top-N terms by frequency after stopword removal.
 */
function extractConcepts(data: unknown, maxConcepts: number = 5): string[] {
  const text = flattenToText(data);

  // Tokenize: split on non-alphanumeric, lowercase
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));

  // Count term frequency
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // Sort by frequency descending, deduplicate
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term);

  return sorted.slice(0, maxConcepts);
}

// =============================================================================
// Category Classification (V1 — Rule-Based, No Model)
// =============================================================================

const CATEGORY_KEYWORDS: Record<CognitiveCategory, string[]> = {
  preference: ['prefer', 'like', 'dislike', 'favorite', 'choice', 'want', 'style', 'theme', 'dark', 'light', 'mode', 'color', 'font', 'language', 'setting'],
  fact: ['fact', 'definition', 'meaning', 'info', 'detail', 'specification', 'version', 'name', 'address', 'email', 'phone', 'birthday', 'age'],
  event: ['event', 'happened', 'occurred', 'meeting', 'call', 'session', 'incident', 'outage', 'deploy', 'release', 'date', 'when', 'yesterday', 'today'],
  procedure: ['step', 'process', 'procedure', 'instruction', 'guide', 'how', 'workflow', 'pipeline', 'setup', 'install', 'configure', 'build', 'run', 'deploy'],
  relationship: ['relationship', 'connected', 'linked', 'partner', 'team', 'member', 'colleague', 'friend', 'manager', 'report', 'owns', 'belongs'],
  observation: ['notice', 'observe', 'see', 'seem', 'appear', 'look', 'trend', 'spike', 'increase', 'decrease', 'anomaly', 'unusual'],
  decision: ['decision', 'decided', 'chose', 'picked', 'selected', 'approved', 'rejected', 'accepted', 'voted', 'agreed', 'consensus'],
  goal: ['goal', 'objective', 'target', 'milestone', 'deadline', 'plan', 'roadmap', 'vision', 'mission', 'achieve', 'complete', 'finish'],
  constraint: ['constraint', 'limit', 'restriction', 'requirement', 'must', 'cannot', 'forbidden', 'blocked', 'dependency', 'prerequisite', 'budget', 'max', 'min'],
  reference: ['reference', 'link', 'url', 'document', 'doc', 'spec', 'api', 'endpoint', 'resource', 'file', 'path', 'repo', 'github'],
  summary: ['summary', 'overview', 'recap', 'brief', 'abstract', 'tldr', 'conclusion', 'synopsis', 'digest', 'highlights'],
  handoff: ['handoff', 'transfer', 'delegate', 'assign', 'pass', 'forward', 'escalate', 'context', 'continuation', 'resume'],
  pattern: ['pattern', 'recurring', 'repeat', 'common', 'typical', 'usual', 'frequent', 'tendency', 'habit', 'behavior', 'heuristic'],
  feedback: ['feedback', 'review', 'rating', 'score', 'evaluation', 'assessment', 'quality', 'improvement', 'suggestion', 'complaint', 'praise'],
  unknown: [],
};

/**
 * Classify data into a cognitive category using keyword matching.
 */
function classifyCategory(data: unknown, context?: string): CognitiveCategory {
  const text = (flattenToText(data) + ' ' + (context || '')).toLowerCase();

  let bestCategory: CognitiveCategory = 'unknown';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CognitiveCategory, string[]][]) {
    if (category === 'unknown') continue;
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// =============================================================================
// Embedding Generation (V1 — Hash-Based, No External Model)
// =============================================================================

/**
 * Generate a 64-dimensional embedding using seeded hash-based random projection.
 * This is a deterministic, lightweight approach that provides coarse but functional
 * semantic similarity. Same-topic texts share many N-grams → similar vectors.
 */
function generateEmbedding64(text: string, projectionSeed: Uint8Array): number[] {
  const normalized = text.toLowerCase().trim();

  // Generate bigram and trigram features
  const tokens = normalized.split(/[^a-z0-9]+/).filter(t => t.length > 1);
  const ngrams: string[] = [];

  // Unigrams
  for (const token of tokens) {
    ngrams.push(token);
  }

  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    ngrams.push(tokens[i] + '_' + tokens[i + 1]);
  }

  // Trigrams
  for (let i = 0; i < tokens.length - 2; i++) {
    ngrams.push(tokens[i] + '_' + tokens[i + 1] + '_' + tokens[i + 2]);
  }

  if (ngrams.length === 0) {
    // Return zero vector for empty text
    return new Array(64).fill(0);
  }

  // Hash each n-gram with projection seed and accumulate per-dimension contributions
  const embedding = new Float64Array(64);

  for (const ngram of ngrams) {
    const input = new TextEncoder().encode(ngram);
    // Hash with seed to get deterministic per-agent projection
    const hash = sodium.crypto_generichash(64, input, projectionSeed);

    // Convert hash bytes to contributions for each dimension
    for (let d = 0; d < 64; d++) {
      // Use hash byte to produce a value in [-1, 1]
      const contribution = (hash[d] / 127.5) - 1.0;
      embedding[d] += contribution;
    }
  }

  // L2-normalize to unit sphere
  let norm = 0;
  for (let d = 0; d < 64; d++) {
    norm += embedding[d] * embedding[d];
  }
  norm = Math.sqrt(norm);

  const result: number[] = new Array(64);
  if (norm > 0) {
    for (let d = 0; d < 64; d++) {
      result[d] = Number((embedding[d] / norm).toFixed(6));
    }
  } else {
    for (let d = 0; d < 64; d++) {
      result[d] = 0;
    }
  }

  return result;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Generate a cognitive fingerprint for data.
 * All computation is client-side. Never sends plaintext to any server.
 *
 * @param data - The data to fingerprint (will be flattened to text)
 * @param encryptionKey - Agent's encryption key (base64)
 * @param context - Optional context hint for category classification
 * @returns Cognitive fingerprint ready for server storage
 */
// Exported for testing and advanced usage
export { deriveCogSalt, deriveProjectionSeed, generateTopicHashes };
export { extractConcepts, classifyCategory, flattenToText };
export { generateEmbedding64 };

export async function generateFingerprint(
  data: unknown,
  encryptionKey: string,
  context?: string
): Promise<CognitiveFingerprint> {
  await sodium.ready;

  const cogSalt = deriveCogSalt(encryptionKey);
  const projSeed = deriveProjectionSeed(encryptionKey);

  const text = flattenToText(data);
  const concepts = extractConcepts(data);
  const topicHashes = generateTopicHashes(concepts, cogSalt);
  const category = classifyCategory(data, context);
  const embedding64 = generateEmbedding64(text, projSeed);

  return {
    topicHashes,
    category,
    embedding64,
    temporalWeight: 1.0, // New memories start at max weight
    version: 1,
  };
}
