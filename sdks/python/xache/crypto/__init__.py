"""Crypto utilities"""

from .signing import (
    sign_request,
    create_signature_message,
    validate_did,
    validate_timestamp,
    generate_auth_headers,
)

from .fingerprint import (
    CognitiveFingerprint,
    CognitiveCategory,
    generate_fingerprint,
    derive_cog_salt,
    derive_projection_seed,
    generate_topic_hashes,
    extract_concepts,
    classify_category,
    flatten_to_text,
    generate_embedding64,
)

__all__ = [
    "sign_request",
    "create_signature_message",
    "validate_did",
    "validate_timestamp",
    "generate_auth_headers",
    # Cognitive Fingerprint
    "CognitiveFingerprint",
    "CognitiveCategory",
    "generate_fingerprint",
    "derive_cog_salt",
    "derive_projection_seed",
    "generate_topic_hashes",
    "extract_concepts",
    "classify_category",
    "flatten_to_text",
    "generate_embedding64",
]
