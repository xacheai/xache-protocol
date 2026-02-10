"""
Cognitive Fingerprint Generation
Per docs/xache_cognition.md

All computation is client-side. The server never sees plaintext.
Generates compact, one-way semantic shadows for zero-knowledge memory probing.
"""

import hashlib
import hmac
import json
import math
import re
import struct
from typing import Any, Dict, List, Optional, Tuple

import nacl.hash
import nacl.encoding

# =============================================================================
# Types
# =============================================================================

COGNITIVE_CATEGORIES = (
    'preference', 'fact', 'event', 'procedure', 'relationship',
    'observation', 'decision', 'goal', 'constraint', 'reference',
    'summary', 'handoff', 'pattern', 'feedback', 'unknown',
)

# =============================================================================
# Key Derivation
# =============================================================================


def derive_cog_salt(encryption_key: bytes) -> bytes:
    """
    Derive cognitive salt for topic hashing using BLAKE2b keyed hash.
    Domain-separated to prevent cross-protocol collision.
    """
    info = b"xache:cognitive:v1:topic-hash"
    return nacl.hash.blake2b(
        info, digest_size=32, key=encryption_key,
        encoder=nacl.encoding.RawEncoder
    )


def derive_projection_seed(encryption_key: bytes) -> bytes:
    """
    Derive projection seed for embedding matrix using BLAKE2b keyed hash.
    """
    info = b"xache:projection:v1:embedding-matrix"
    return nacl.hash.blake2b(
        info, digest_size=32, key=encryption_key,
        encoder=nacl.encoding.RawEncoder
    )


# =============================================================================
# Topic Hash Generation
# =============================================================================


def generate_topic_hashes(concepts: List[str], cog_salt: bytes) -> List[str]:
    """
    Generate HMAC-based topic hashes from concepts.
    Each concept is normalized and hashed with the agent-specific cognitive salt.
    """
    result = []
    for c in concepts:
        normalized = c.lower().strip().encode("utf-8")
        h = nacl.hash.blake2b(
            normalized, digest_size=32, key=cog_salt,
            encoder=nacl.encoding.HexEncoder
        )
        result.append(h.decode("ascii"))
    return result


# =============================================================================
# Concept Extraction (V1 — TF Heuristic, No Model)
# =============================================================================

STOPWORDS = frozenset({
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
})


def flatten_to_text(data: Any) -> str:
    """Flatten any data structure to a text string for processing."""
    if isinstance(data, str):
        return data
    if isinstance(data, (int, float, bool)):
        return str(data)
    if data is None:
        return ""
    if isinstance(data, (list, tuple)):
        return " ".join(flatten_to_text(item) for item in data)
    if isinstance(data, dict):
        parts = []
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
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    tokens = [t for t in tokens if len(t) > 2 and t not in STOPWORDS]

    freq: Dict[str, int] = {}
    for token in tokens:
        freq[token] = freq.get(token, 0) + 1

    sorted_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [term for term, _ in sorted_terms[:max_concepts]]


# =============================================================================
# Category Classification (V1 — Rule-Based, No Model)
# =============================================================================

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    'preference': ['prefer', 'like', 'dislike', 'favorite', 'choice', 'want', 'style', 'theme', 'dark', 'light', 'mode', 'color', 'font', 'language', 'setting'],
    'fact': ['fact', 'definition', 'meaning', 'info', 'detail', 'specification', 'version', 'name', 'address', 'email', 'phone', 'birthday', 'age'],
    'event': ['event', 'happened', 'occurred', 'meeting', 'call', 'session', 'incident', 'outage', 'deploy', 'release', 'date', 'when', 'yesterday', 'today'],
    'procedure': ['step', 'process', 'procedure', 'instruction', 'guide', 'how', 'workflow', 'pipeline', 'setup', 'install', 'configure', 'build', 'run', 'deploy'],
    'relationship': ['relationship', 'connected', 'linked', 'partner', 'team', 'member', 'colleague', 'friend', 'manager', 'report', 'owns', 'belongs'],
    'observation': ['notice', 'observe', 'see', 'seem', 'appear', 'look', 'trend', 'spike', 'increase', 'decrease', 'anomaly', 'unusual'],
    'decision': ['decision', 'decided', 'chose', 'picked', 'selected', 'approved', 'rejected', 'accepted', 'voted', 'agreed', 'consensus'],
    'goal': ['goal', 'objective', 'target', 'milestone', 'deadline', 'plan', 'roadmap', 'vision', 'mission', 'achieve', 'complete', 'finish'],
    'constraint': ['constraint', 'limit', 'restriction', 'requirement', 'must', 'cannot', 'forbidden', 'blocked', 'dependency', 'prerequisite', 'budget', 'max', 'min'],
    'reference': ['reference', 'link', 'url', 'document', 'doc', 'spec', 'api', 'endpoint', 'resource', 'file', 'path', 'repo', 'github'],
    'summary': ['summary', 'overview', 'recap', 'brief', 'abstract', 'tldr', 'conclusion', 'synopsis', 'digest', 'highlights'],
    'handoff': ['handoff', 'transfer', 'delegate', 'assign', 'pass', 'forward', 'escalate', 'context', 'continuation', 'resume'],
    'pattern': ['pattern', 'recurring', 'repeat', 'common', 'typical', 'usual', 'frequent', 'tendency', 'habit', 'behavior', 'heuristic'],
    'feedback': ['feedback', 'review', 'rating', 'score', 'evaluation', 'assessment', 'quality', 'improvement', 'suggestion', 'complaint', 'praise'],
}


def classify_category(data: Any, context: Optional[str] = None) -> str:
    """Classify data into a cognitive category using keyword matching."""
    text = (flatten_to_text(data) + " " + (context or "")).lower()

    best_category = "unknown"
    best_score = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
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
    Deterministic, lightweight approach for coarse semantic similarity.
    """
    normalized = text.lower().strip()
    tokens = [t for t in re.findall(r'[a-z0-9]+', normalized) if len(t) > 1]

    ngrams: List[str] = []

    # Unigrams
    ngrams.extend(tokens)

    # Bigrams
    for i in range(len(tokens) - 1):
        ngrams.append(tokens[i] + "_" + tokens[i + 1])

    # Trigrams
    for i in range(len(tokens) - 2):
        ngrams.append(tokens[i] + "_" + tokens[i + 1] + "_" + tokens[i + 2])

    if not ngrams:
        return [0.0] * 64

    embedding = [0.0] * 64

    for ngram in ngrams:
        h = nacl.hash.blake2b(
            ngram.encode("utf-8"), digest_size=64, key=projection_seed,
            encoder=nacl.encoding.RawEncoder
        )
        for d in range(64):
            contribution = (h[d] / 127.5) - 1.0
            embedding[d] += contribution

    # L2-normalize
    norm = math.sqrt(sum(x * x for x in embedding))
    if norm > 0:
        embedding = [round(x / norm, 6) for x in embedding]
    else:
        embedding = [0.0] * 64

    return embedding


# =============================================================================
# Main Entry Point
# =============================================================================


def generate_fingerprint(
    data: Any,
    encryption_key: bytes,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a cognitive fingerprint for data.
    All computation is client-side. Never sends plaintext to any server.

    Args:
        data: The data to fingerprint (will be flattened to text)
        encryption_key: Agent's encryption key (raw bytes)
        context: Optional context hint for category classification

    Returns:
        Dict with topicHashes, category, embedding64, temporalWeight, version
    """
    cog_salt = derive_cog_salt(encryption_key)
    proj_seed = derive_projection_seed(encryption_key)

    concepts = extract_concepts(data)
    topic_hashes = generate_topic_hashes(concepts, cog_salt)
    category = classify_category(data, context)
    text = flatten_to_text(data)
    embedding64 = generate_embedding64(text, proj_seed)

    return {
        "topicHashes": topic_hashes,
        "category": category,
        "embedding64": embedding64,
        "temporalWeight": 1.0,
        "version": 1,
    }
