"""
Subject Keys Cryptographic Utilities

Provides client-side HMAC derivation for pseudonymous subject identification.
The server never sees raw subject identifiers (customer IDs, user IDs, etc.).
"""

import hmac
import hashlib
import re
from typing import Dict, List, Literal, Optional

from dataclasses import dataclass


# Types
SubjectId = str  # 64-character hex string (HMAC-SHA256 output)
MemoryScope = Literal["SUBJECT", "SEGMENT", "GLOBAL"]
SegmentId = str
TenantId = str


@dataclass
class SubjectContext:
    """Subject context for memory operations."""
    scope: MemoryScope
    subject_id: Optional[SubjectId] = None
    segment_id: Optional[SegmentId] = None
    tenant_id: Optional[TenantId] = None


@dataclass
class SubjectRetrievalContext:
    """Subject context for memory retrieval operations."""
    subject_id: Optional[SubjectId] = None
    include_segment: bool = True
    include_global: bool = True
    segment_id: Optional[SegmentId] = None
    tenant_id: Optional[TenantId] = None


@dataclass
class SubjectDerivationOptions:
    """Subject derivation options."""
    domain: str = "xache:subject:v1"


def derive_subject_id(
    agent_key: bytes,
    raw_subject_id: str,
    options: Optional[SubjectDerivationOptions] = None,
) -> SubjectId:
    """
    Derive a pseudonymous subject ID using HMAC-SHA256.

    Creates a deterministic, irreversible identifier from a raw subject ID.
    The derived subject ID:
    - Is pseudonymous (cannot be reversed to the original ID)
    - Is deterministic (same inputs always produce same output)
    - Is unique per agent (different agents produce different subject IDs)
    - Is 64 hex characters (256 bits)

    Args:
        agent_key: Agent's encryption key (32 bytes)
        raw_subject_id: Raw subject identifier (customer ID, user ID, etc.)
        options: Optional derivation configuration

    Returns:
        64-character hex string (pseudonymous subject ID)
    """
    if len(agent_key) != 32:
        raise ValueError(f"Invalid agent key length: expected 32 bytes, got {len(agent_key)}")

    domain = options.domain if options else "xache:subject:v1"
    message = f"{domain}:{raw_subject_id}".encode("utf-8")

    # Derive HMAC key from agent key using BLAKE2b
    hmac_key = hashlib.blake2b(agent_key, digest_size=32).digest()
    mac = hmac.new(hmac_key, message, hashlib.sha256)
    return mac.hexdigest()


def is_valid_subject_id(subject_id: str) -> bool:
    """Validate that a subject ID has the correct format (64 hex chars)."""
    if not isinstance(subject_id, str):
        return False
    return bool(re.match(r"^[a-f0-9]{64}$", subject_id))


def is_valid_scope(scope: str) -> bool:
    """Validate that a scope is valid."""
    return scope in ("SUBJECT", "SEGMENT", "GLOBAL")


def create_subject_context(
    subject_id: SubjectId,
    tenant_id: Optional[str] = None,
) -> SubjectContext:
    """Create a SUBJECT-scoped context."""
    if not is_valid_subject_id(subject_id):
        raise ValueError("Invalid subject ID format: must be 64 hex characters")
    return SubjectContext(
        subject_id=subject_id,
        scope="SUBJECT",
        tenant_id=tenant_id,
    )


def create_segment_context(
    segment_id: str,
    tenant_id: Optional[str] = None,
) -> SubjectContext:
    """Create a SEGMENT-scoped context."""
    if not segment_id:
        raise ValueError("Segment ID cannot be empty")
    return SubjectContext(
        segment_id=segment_id,
        scope="SEGMENT",
        tenant_id=tenant_id,
    )


def create_global_context(
    tenant_id: Optional[str] = None,
) -> SubjectContext:
    """Create a GLOBAL-scoped context."""
    return SubjectContext(
        scope="GLOBAL",
        tenant_id=tenant_id,
    )


def validate_subject_context(context: SubjectContext) -> None:
    """
    Validate a subject context for consistency.

    Raises:
        ValueError: If context is invalid
    """
    if not is_valid_scope(context.scope):
        raise ValueError(f"Invalid scope: {context.scope}")

    if context.scope == "SUBJECT":
        if not context.subject_id:
            raise ValueError("subject_id is required when scope is SUBJECT")
        if not is_valid_subject_id(context.subject_id):
            raise ValueError("Invalid subject_id format: must be 64 hex characters")

    if context.scope == "SEGMENT":
        if not context.segment_id:
            raise ValueError("segment_id is required when scope is SEGMENT")


def derive_entity_key(agent_key: bytes, entity_name: str) -> SubjectId:
    """
    Derive an HMAC entity key for knowledge graph entities.

    Entity names are normalized (lowercase, trimmed) before HMAC so
    "Alice Chen" and "alice chen" produce the same key.

    Args:
        agent_key: Agent's encryption key (32 bytes)
        entity_name: Raw entity name

    Returns:
        64-character hex string
    """
    normalized = entity_name.strip().lower()
    return derive_subject_id(
        agent_key, normalized,
        SubjectDerivationOptions(domain="xache:entity:v1"),
    )


def batch_derive_subject_ids(
    agent_key: bytes,
    raw_subject_ids: List[str],
    options: Optional[SubjectDerivationOptions] = None,
) -> Dict[str, SubjectId]:
    """
    Batch derive subject IDs for multiple raw identifiers.

    Args:
        agent_key: Agent's encryption key (32 bytes)
        raw_subject_ids: Array of raw subject identifiers
        options: Optional derivation configuration

    Returns:
        Dict mapping raw ID to derived subject ID
    """
    if len(agent_key) != 32:
        raise ValueError(f"Invalid agent key length: expected 32 bytes, got {len(agent_key)}")

    domain = options.domain if options else "xache:subject:v1"
    hmac_key = hashlib.blake2b(agent_key, digest_size=32).digest()

    results: Dict[str, SubjectId] = {}
    for raw_id in raw_subject_ids:
        message = f"{domain}:{raw_id}".encode("utf-8")
        mac = hmac.new(hmac_key, message, hashlib.sha256)
        results[raw_id] = mac.hexdigest()

    return results


def batch_derive_entity_keys(
    agent_key: bytes,
    entity_names: List[str],
) -> Dict[str, SubjectId]:
    """
    Batch derive entity keys for multiple entity names.

    Args:
        agent_key: Agent's encryption key (32 bytes)
        entity_names: Array of entity names

    Returns:
        Dict mapping normalized name to derived entity key
    """
    if len(agent_key) != 32:
        raise ValueError(f"Invalid agent key length: expected 32 bytes, got {len(agent_key)}")

    domain = "xache:entity:v1"
    hmac_key = hashlib.blake2b(agent_key, digest_size=32).digest()

    results: Dict[str, SubjectId] = {}
    for name in entity_names:
        normalized = name.strip().lower()
        message = f"{domain}:{normalized}".encode("utf-8")
        mac = hmac.new(hmac_key, message, hashlib.sha256)
        results[normalized] = mac.hexdigest()

    return results
