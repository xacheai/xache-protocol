"""
Cross-SDK Parity Tests — Cognitive Fingerprints

Verifies that the Python SDK produces IDENTICAL fingerprint components
to the TypeScript SDK for the same inputs. This is critical: if they
diverge, TS-stored memories can't be probed from Python and vice versa.

Reference vectors generated from TypeScript SDK (libsodium-wrappers).
"""

import math
import pytest

from xache.crypto.fingerprint import (
    derive_cog_salt,
    derive_projection_seed,
    generate_topic_hashes,
    extract_concepts,
    classify_category,
    generate_embedding64,
    generate_fingerprint,
)


# =============================================================================
# Reference vectors (generated from TypeScript SDK)
# =============================================================================

# Test key: 32 zero bytes (same in both SDKs)
TEST_KEY = bytes(32)

# Expected BLAKE2b keyed hash outputs (verified identical in both SDKs)
EXPECTED_COG_SALT_HEX = "78efa6875cd49c0e17321305fe837055f2c975aca20dfad449e3fb996864e35f"
EXPECTED_PROJ_SEED_HEX = "d56d17e1ca41674abfec82b89f557b595b3598cc5386f23d92c4b695cf8f4d4f"

# Topic hashes for known concepts
EXPECTED_TOPIC_HASH_DATABASE = "c3430c93c49abfb8fc7435e35a537b9eae0a2ab47f20362af80432effda3a779"
EXPECTED_TOPIC_HASH_MIGRATION = "ef68ea96febe26c32ffd6a04bb746071e21816b261876e0d701b684d3fbb7d2b"


# =============================================================================
# Key Derivation Parity
# =============================================================================


class TestKeyDerivationParity:
    """Verify BLAKE2b key derivation matches TypeScript SDK exactly."""

    def test_cog_salt_matches_typescript(self):
        salt = derive_cog_salt(TEST_KEY)
        assert salt.hex() == EXPECTED_COG_SALT_HEX

    def test_projection_seed_matches_typescript(self):
        seed = derive_projection_seed(TEST_KEY)
        assert seed.hex() == EXPECTED_PROJ_SEED_HEX


# =============================================================================
# Topic Hash Parity
# =============================================================================


class TestTopicHashParity:
    """Verify topic hashes match TypeScript SDK exactly."""

    def test_database_hash_matches_typescript(self):
        cog_salt = derive_cog_salt(TEST_KEY)
        [h] = generate_topic_hashes(["database"], cog_salt)
        assert h == EXPECTED_TOPIC_HASH_DATABASE

    def test_migration_hash_matches_typescript(self):
        cog_salt = derive_cog_salt(TEST_KEY)
        [h] = generate_topic_hashes(["migration"], cog_salt)
        assert h == EXPECTED_TOPIC_HASH_MIGRATION


# =============================================================================
# Concept Extraction Parity
# =============================================================================


class TestConceptExtractionParity:
    """
    Verify concept extraction produces the same terms.
    Both SDKs use the same regex, stopword list, and frequency sort.
    """

    def test_same_concepts_for_known_input(self):
        concepts = extract_concepts(
            "The database migration process failed during deployment"
        )
        # Must match TS: ["database", "migration", "process", "failed", "deployment"]
        assert concepts == ["database", "migration", "process", "failed", "deployment"]

    def test_empty_input_matches(self):
        assert extract_concepts("") == []

    def test_stopword_only_input_matches(self):
        assert extract_concepts("the is a an and or but") == []


# =============================================================================
# Classification Parity
# =============================================================================


class TestClassificationParity:
    """Verify category classification matches TypeScript SDK."""

    def test_preference_classification(self):
        assert classify_category("I prefer dark mode and like monospace fonts") == "preference"

    def test_procedure_classification(self):
        assert classify_category("Step 1: install dependencies. Step 2: configure the pipeline and build") == "procedure"

    def test_unknown_classification(self):
        assert classify_category("xyz abc 123") == "unknown"


# =============================================================================
# Embedding Parity (structural, not bitwise)
# =============================================================================


class TestEmbeddingParity:
    """
    Verify embedding properties match.
    Note: Exact floating point values may differ slightly between
    JS Float64 and Python float, but structural properties must match:
    - Same dimensionality (64)
    - Unit L2 norm
    - Zero vector for empty input
    - Determinism
    """

    def test_dimensionality(self):
        proj_seed = derive_projection_seed(TEST_KEY)
        emb = generate_embedding64("hello world test embedding", proj_seed)
        assert len(emb) == 64

    def test_zero_vector_for_empty(self):
        proj_seed = derive_projection_seed(TEST_KEY)
        emb = generate_embedding64("", proj_seed)
        assert all(v == 0.0 for v in emb)

    def test_unit_norm(self):
        proj_seed = derive_projection_seed(TEST_KEY)
        emb = generate_embedding64("hello world test embedding", proj_seed)
        norm = math.sqrt(sum(v * v for v in emb))
        assert abs(norm - 1.0) < 0.01

    def test_determinism(self):
        proj_seed = derive_projection_seed(TEST_KEY)
        emb1 = generate_embedding64("test", proj_seed)
        emb2 = generate_embedding64("test", proj_seed)
        assert emb1 == emb2


# =============================================================================
# Full Fingerprint Parity
# =============================================================================


class TestFullFingerprintParity:
    """Verify that a full fingerprint generation matches cross-SDK."""

    def test_topic_hashes_match_reference(self):
        """Same data + same key must produce same topic hashes."""
        data = "The database migration process failed during deployment"
        fp = generate_fingerprint(data, TEST_KEY)

        # Verify the topic hashes contain expected hashes for extracted concepts
        cog_salt = derive_cog_salt(TEST_KEY)
        expected_hashes = generate_topic_hashes(
            ["database", "migration", "process", "failed", "deployment"],
            cog_salt,
        )
        assert fp["topicHashes"] == expected_hashes

    def test_category_matches_reference(self):
        fp = generate_fingerprint(
            "The user prefers dark mode and likes TypeScript",
            TEST_KEY,
        )
        assert fp["category"] == "preference"

    def test_version_and_weight(self):
        fp = generate_fingerprint("anything", TEST_KEY)
        assert fp["version"] == 1
        assert fp["temporalWeight"] == 1.0
