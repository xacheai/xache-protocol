"""
Cognitive Fingerprint Generation
Per docs/xache_cognition.md

All computation is client-side. The server never sees plaintext.
Generates compact, one-way semantic shadows for zero-knowledge memory probing.

Algorithm-compatible with sdk/typescript/src/crypto/fingerprint.ts.
"""

import base64
import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Sequence, Union

import nacl.encoding
import nacl.hash

# =============================================================================
# Types
# =============================================================================

CognitiveCategory = Literal[
    "preference", "fact", "event", "procedure", "relationship",
    "observation", "decision", "goal", "constraint", "reference",
    "summary", "handoff", "pattern", "feedback", "unknown",
]


@dataclass
class CognitiveFingerprint:
    """Client-generated cognitive fingerprint for zero-knowledge semantic search."""
    topic_hashes: List[str]
    category: CognitiveCategory
    embedding64: List[float]
    temporal_weight: float
    version: int


# =============================================================================
# Key Derivation
# =============================================================================

def derive_cog_salt(encryption_key: str) -> bytes:
    """
    Derive cognitive salt for topic hashing using BLAKE2b keyed hash.
    Domain-separated to prevent cross-protocol collision.

    Args:
        encryption_key: Agent's encryption key (base64-encoded)

    Returns:
        32-byte cognitive salt
    """
    key_bytes = base64.b64decode(encryption_key)
    info = b"xache:cognitive:v1:topic-hash"
    # BLAKE2b-256 keyed hash (matches TS: sodium.crypto_generichash(32, info, keyBytes))
    return nacl.hash.blake2b(
        info,
        digest_size=32,
        key=key_bytes,
        encoder=nacl.encoding.RawEncoder,
    )


def derive_projection_seed(encryption_key: str) -> bytes:
    """
    Derive projection seed for embedding matrix using BLAKE2b keyed hash.

    Args:
        encryption_key: Agent's encryption key (base64-encoded)

    Returns:
        32-byte projection seed
    """
    key_bytes = base64.b64decode(encryption_key)
    info = b"xache:projection:v1:embedding-matrix"
    return nacl.hash.blake2b(
        info,
        digest_size=32,
        key=key_bytes,
        encoder=nacl.encoding.RawEncoder,
    )


# =============================================================================
# Topic Hash Generation
# =============================================================================

def generate_topic_hashes(concepts: List[str], cog_salt: bytes) -> List[str]:
    """
    Generate HMAC-based topic hashes from concepts.
    Each concept is normalized and hashed with the agent-specific cognitive salt.

    Args:
        concepts: List of concept strings
        cog_salt: 32-byte cognitive salt

    Returns:
        List of hex-encoded topic hashes
    """
    hashes: List[str] = []
    for concept in concepts:
        normalized = concept.lower().strip()
        input_bytes = normalized.encode("utf-8")
        # BLAKE2b keyed hash (matches TS: sodium.crypto_generichash(32, input, cogSalt))
        h = nacl.hash.blake2b(
            input_bytes,
            digest_size=32,
            key=cog_salt,
            encoder=nacl.encoding.HexEncoder,
        )
        hashes.append(h.decode("ascii"))
    return hashes


# =============================================================================
# Concept Extraction (V1 — TF-IDF Heuristic, No Model)
# =============================================================================

STOPWORDS = frozenset([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "but", "and", "or", "if", "while", "about", "up",
    "this", "that", "these", "those", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their", "what", "which", "who", "whom", "null", "undefined", "true",
    "false", "string", "number", "object", "array", "value", "key", "data",
])

_TOKEN_RE = re.compile(r"[^a-z0-9]+")


def flatten_to_text(data: Any) -> str:
    """Flatten any data structure to a text string for processing."""
    if isinstance(data, str):
        return data
    if isinstance(data, (int, float, bool)):
        return str(data).lower() if isinstance(data, bool) else str(data)
    if data is None:
        return ""
    if isinstance(data, (list, tuple)):
        return " ".join(flatten_to_text(item) for item in data)
    if isinstance(data, dict):
        parts: List[str] = []
        for k, v in data.items():
            parts.append(str(k))
            parts.append(flatten_to_text(v))
        return " ".join(parts)
    return str(data)


def extract_concepts(data: Any, max_concepts: int = 5) -> List[str]:
    """
    Extract key concepts from data using TF heuristic.
    Returns top-N terms by frequency after stopword removal.
    """
    text = flatten_to_text(data)

    # Tokenize: split on non-alphanumeric, lowercase
    tokens = [t for t in _TOKEN_RE.split(text.lower()) if len(t) > 2 and t not in STOPWORDS]

    # Count term frequency
    freq: Dict[str, int] = {}
    for token in tokens:
        freq[token] = freq.get(token, 0) + 1

    # Sort by frequency descending
    sorted_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)

    return [term for term, _ in sorted_terms[:max_concepts]]


# =============================================================================
# Category Classification (V1 — Rule-Based, No Model)
# =============================================================================

CATEGORY_KEYWORDS: Dict[CognitiveCategory, List[str]] = {
    "preference": ["prefer", "like", "dislike", "favorite", "choice", "want", "style", "theme", "dark", "light", "mode", "color", "font", "language", "setting"],
    "fact": ["fact", "definition", "meaning", "info", "detail", "specification", "version", "name", "address", "email", "phone", "birthday", "age"],
    "event": ["event", "happened", "occurred", "meeting", "call", "session", "incident", "outage", "deploy", "release", "date", "when", "yesterday", "today"],
    "procedure": ["step", "process", "procedure", "instruction", "guide", "how", "workflow", "pipeline", "setup", "install", "configure", "build", "run", "deploy"],
    "relationship": ["relationship", "connected", "linked", "partner", "team", "member", "colleague", "friend", "manager", "report", "owns", "belongs"],
    "observation": ["notice", "observe", "see", "seem", "appear", "look", "trend", "spike", "increase", "decrease", "anomaly", "unusual"],
    "decision": ["decision", "decided", "chose", "picked", "selected", "approved", "rejected", "accepted", "voted", "agreed", "consensus"],
    "goal": ["goal", "objective", "target", "milestone", "deadline", "plan", "roadmap", "vision", "mission", "achieve", "complete", "finish"],
    "constraint": ["constraint", "limit", "restriction", "requirement", "must", "cannot", "forbidden", "blocked", "dependency", "prerequisite", "budget", "max", "min"],
    "reference": ["reference", "link", "url", "document", "doc", "spec", "api", "endpoint", "resource", "file", "path", "repo", "github"],
    "summary": ["summary", "overview", "recap", "brief", "abstract", "tldr", "conclusion", "synopsis", "digest", "highlights"],
    "handoff": ["handoff", "transfer", "delegate", "assign", "pass", "forward", "escalate", "context", "continuation", "resume"],
    "pattern": ["pattern", "recurring", "repeat", "common", "typical", "usual", "frequent", "tendency", "habit", "behavior", "heuristic"],
    "feedback": ["feedback", "review", "rating", "score", "evaluation", "assessment", "quality", "improvement", "suggestion", "complaint", "praise"],
    "unknown": [],
}


def classify_category(data: Any, context: Optional[str] = None) -> CognitiveCategory:
    """Classify data into a cognitive category using keyword matching."""
    text = (flatten_to_text(data) + " " + (context or "")).lower()

    best_category: CognitiveCategory = "unknown"
    best_score = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        if category == "unknown":
            continue
        score = sum(1 for keyword in keywords if keyword in text)
        if score > best_score:
            best_score = score
            best_category = category

    return best_category


# =============================================================================
# Embedding Generation (V1 — Hash-Based, No External Model)
# =============================================================================

def generate_embedding64(text: str, projection_seed: bytes) -> List[float]:
    """
    Generate a 64-dimensional embedding using seeded hash-based random projection.
    Deterministic, lightweight approach providing coarse but functional semantic similarity.

    Args:
        text: Input text
        projection_seed: 32-byte seed for deterministic projection

    Returns:
        64-element normalized float vector
    """
    normalized = text.lower().strip()

    # Tokenize
    tokens = [t for t in _TOKEN_RE.split(normalized) if len(t) > 1]

    # Generate unigrams, bigrams, trigrams
    ngrams: List[str] = list(tokens)

    for i in range(len(tokens) - 1):
        ngrams.append(tokens[i] + "_" + tokens[i + 1])

    for i in range(len(tokens) - 2):
        ngrams.append(tokens[i] + "_" + tokens[i + 1] + "_" + tokens[i + 2])

    if not ngrams:
        return [0.0] * 64

    # Hash each n-gram with projection seed and accumulate per-dimension contributions
    embedding = [0.0] * 64

    for ngram in ngrams:
        input_bytes = ngram.encode("utf-8")
        # BLAKE2b-512 keyed hash (matches TS: sodium.crypto_generichash(64, input, projectionSeed))
        h = nacl.hash.blake2b(
            input_bytes,
            digest_size=64,
            key=projection_seed,
            encoder=nacl.encoding.RawEncoder,
        )

        # Convert hash bytes to contributions for each dimension
        for d in range(64):
            contribution = (h[d] / 127.5) - 1.0
            embedding[d] += contribution

    # L2-normalize to unit sphere
    norm = math.sqrt(sum(x * x for x in embedding))

    if norm > 0:
        return [round(x / norm, 6) for x in embedding]
    return [0.0] * 64


# =============================================================================
# Main Entry Point
# =============================================================================

def generate_fingerprint(
    data: Any,
    encryption_key: str,
    context: Optional[str] = None,
) -> CognitiveFingerprint:
    """
    Generate a cognitive fingerprint for data.
    All computation is client-side. Never sends plaintext to any server.

    Args:
        data: The data to fingerprint (will be flattened to text)
        encryption_key: Agent's encryption key (base64-encoded string)
        context: Optional context hint for category classification

    Returns:
        CognitiveFingerprint ready for server storage
    """
    cog_salt = derive_cog_salt(encryption_key)
    proj_seed = derive_projection_seed(encryption_key)

    text = flatten_to_text(data)
    concepts = extract_concepts(data)
    topic_hashes = generate_topic_hashes(concepts, cog_salt)
    category = classify_category(data, context)
    embedding64 = generate_embedding64(text, proj_seed)

    return CognitiveFingerprint(
        topic_hashes=topic_hashes,
        category=category,
        embedding64=embedding64,
        temporal_weight=1.0,
        version=1,
    )
