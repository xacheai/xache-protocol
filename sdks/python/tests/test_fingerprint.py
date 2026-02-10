"""
Unit tests for Cognitive Fingerprint Generation (Python SDK)

Tests cover:
- Key derivation determinism
- Concept extraction (TF heuristic)
- Category classification (keyword-based)
- Topic hash generation
- Embedding generation (hash-based random projection)
- Full fingerprint generation
- Edge cases (empty input, unicode, nested objects)
"""

import math
import pytest
import nacl.utils
import nacl.encoding

from xache.crypto.fingerprint import (
    COGNITIVE_CATEGORIES,
    derive_cog_salt,
    derive_projection_seed,
    generate_topic_hashes,
    extract_concepts,
    classify_category,
    flatten_to_text,
    generate_embedding64,
    generate_fingerprint,
)


# Deterministic test key (32 zero bytes — NOT real, safe to commit)
TEST_KEY = bytes(32)


# =============================================================================
# flatten_to_text
# =============================================================================


class TestFlattenToText:
    def test_returns_string_as_is(self):
        assert flatten_to_text("hello world") == "hello world"

    def test_stringifies_numbers_and_booleans(self):
        assert flatten_to_text(42) == "42"
        assert flatten_to_text(True) == "True"

    def test_returns_empty_for_none(self):
        assert flatten_to_text(None) == ""

    def test_flattens_lists(self):
        assert flatten_to_text(["a", "b", "c"]) == "a b c"

    def test_flattens_dicts(self):
        result = flatten_to_text({"name": "Alice", "age": 30})
        assert "name" in result
        assert "Alice" in result
        assert "age" in result
        assert "30" in result

    def test_handles_nested_structures(self):
        result = flatten_to_text({"user": {"name": "Bob", "tags": ["admin", "dev"]}})
        assert "Bob" in result
        assert "admin" in result
        assert "dev" in result


# =============================================================================
# extract_concepts
# =============================================================================


class TestExtractConcepts:
    def test_extracts_top_terms_by_frequency(self):
        concepts = extract_concepts(
            "The database migration failed. The database was updated but migration rolled back."
        )
        assert "database" in concepts
        assert "migration" in concepts

    def test_filters_stopwords(self):
        concepts = extract_concepts("the is a an and or but for to")
        assert len(concepts) == 0

    def test_filters_short_tokens(self):
        concepts = extract_concepts("go to db in on at")
        assert len(concepts) == 0

    def test_respects_max_concepts(self):
        concepts = extract_concepts(
            "alpha bravo charlie delta echo foxtrot golf hotel india juliet",
            max_concepts=3,
        )
        assert len(concepts) <= 3

    def test_handles_dict_input(self):
        concepts = extract_concepts({"preference": "dark mode", "language": "typescript"})
        assert len(concepts) > 0

    def test_returns_empty_for_empty_input(self):
        assert extract_concepts("") == []
        assert extract_concepts(None) == []

    def test_case_insensitive(self):
        lower = extract_concepts("Database Migration")
        upper = extract_concepts("DATABASE MIGRATION")
        assert lower == upper


# =============================================================================
# classify_category
# =============================================================================


class TestClassifyCategory:
    def test_classifies_preference(self):
        assert classify_category("I prefer dark mode and like monospace fonts") == "preference"

    def test_classifies_fact(self):
        assert classify_category("My email address is alice@example.com and my birthday is March 5") == "fact"

    def test_classifies_event(self):
        assert classify_category("A meeting happened yesterday about the outage incident") == "event"

    def test_classifies_procedure(self):
        assert classify_category("Step 1: install dependencies. Step 2: configure the pipeline and build") == "procedure"

    def test_classifies_goal(self):
        assert classify_category("Our goal is to achieve the milestone by the deadline") == "goal"

    def test_classifies_constraint(self):
        assert classify_category("The budget limit must not exceed the max requirement") == "constraint"

    def test_classifies_reference(self):
        assert classify_category("See the API spec document at the github repo endpoint") == "reference"

    def test_classifies_feedback(self):
        assert classify_category("The review score and evaluation suggest quality improvement needed") == "feedback"

    def test_returns_unknown_for_ambiguous(self):
        assert classify_category("xyz abc 123") == "unknown"

    def test_uses_context_hint(self):
        result = classify_category("blue and red", context="prefer these colors style theme")
        assert result == "preference"


# =============================================================================
# Key Derivation
# =============================================================================


class TestKeyDerivation:
    def test_cog_salt_returns_32_bytes(self):
        salt = derive_cog_salt(TEST_KEY)
        assert isinstance(salt, bytes)
        assert len(salt) == 32

    def test_projection_seed_returns_32_bytes(self):
        seed = derive_projection_seed(TEST_KEY)
        assert isinstance(seed, bytes)
        assert len(seed) == 32

    def test_deterministic_cog_salt(self):
        salt1 = derive_cog_salt(TEST_KEY)
        salt2 = derive_cog_salt(TEST_KEY)
        assert salt1 == salt2

    def test_deterministic_projection_seed(self):
        seed1 = derive_projection_seed(TEST_KEY)
        seed2 = derive_projection_seed(TEST_KEY)
        assert seed1 == seed2

    def test_domain_separation(self):
        salt = derive_cog_salt(TEST_KEY)
        seed = derive_projection_seed(TEST_KEY)
        assert salt != seed

    def test_different_keys_produce_different_salts(self):
        key2 = bytes([99] * 32)
        salt1 = derive_cog_salt(TEST_KEY)
        salt2 = derive_cog_salt(key2)
        assert salt1 != salt2


# =============================================================================
# Topic Hashes
# =============================================================================


class TestTopicHashes:
    @pytest.fixture
    def cog_salt(self):
        return derive_cog_salt(TEST_KEY)

    def test_produces_hex_strings(self, cog_salt):
        hashes = generate_topic_hashes(["database", "migration"], cog_salt)
        assert len(hashes) == 2
        for h in hashes:
            assert len(h) == 64  # 32 bytes = 64 hex chars
            int(h, 16)  # Should be valid hex

    def test_deterministic(self, cog_salt):
        h1 = generate_topic_hashes(["database"], cog_salt)
        h2 = generate_topic_hashes(["database"], cog_salt)
        assert h1 == h2

    def test_normalizes_case(self, cog_salt):
        lower = generate_topic_hashes(["database"], cog_salt)
        upper = generate_topic_hashes(["DATABASE"], cog_salt)
        assert lower == upper

    def test_trims_whitespace(self, cog_salt):
        clean = generate_topic_hashes(["database"], cog_salt)
        padded = generate_topic_hashes(["  database  "], cog_salt)
        assert clean == padded

    def test_different_concepts_produce_different_hashes(self, cog_salt):
        [h1] = generate_topic_hashes(["database"], cog_salt)
        [h2] = generate_topic_hashes(["network"], cog_salt)
        assert h1 != h2

    def test_different_salts_produce_different_hashes(self, cog_salt):
        other_key = bytes([99] * 32)
        other_salt = derive_cog_salt(other_key)
        [h1] = generate_topic_hashes(["database"], cog_salt)
        [h2] = generate_topic_hashes(["database"], other_salt)
        assert h1 != h2


# =============================================================================
# Embedding Generation
# =============================================================================


class TestEmbedding64:
    @pytest.fixture
    def proj_seed(self):
        return derive_projection_seed(TEST_KEY)

    def test_returns_64_dimensions(self, proj_seed):
        emb = generate_embedding64("hello world test embedding", proj_seed)
        assert len(emb) == 64

    def test_returns_zeros_for_empty_text(self, proj_seed):
        emb = generate_embedding64("", proj_seed)
        assert len(emb) == 64
        assert all(v == 0.0 for v in emb)

    def test_l2_normalized(self, proj_seed):
        emb = generate_embedding64("the quick brown fox jumps over the lazy dog", proj_seed)
        norm = math.sqrt(sum(v * v for v in emb))
        assert abs(norm - 1.0) < 0.01

    def test_deterministic(self, proj_seed):
        emb1 = generate_embedding64("same text same result", proj_seed)
        emb2 = generate_embedding64("same text same result", proj_seed)
        assert emb1 == emb2

    def test_similar_texts_produce_similar_embeddings(self, proj_seed):
        emb1 = generate_embedding64("the user prefers dark mode theme", proj_seed)
        emb2 = generate_embedding64("user likes dark mode color theme", proj_seed)
        cosine = sum(a * b for a, b in zip(emb1, emb2))
        # Hash-based embeddings are coarse, so threshold is modest
        assert cosine > 0.3

    def test_dissimilar_texts_produce_less_similar_embeddings(self, proj_seed):
        emb1 = generate_embedding64("the user prefers dark mode theme", proj_seed)
        emb2 = generate_embedding64("quantum mechanics wave function collapse", proj_seed)
        cosine = sum(a * b for a, b in zip(emb1, emb2))
        assert cosine < 0.5

    def test_different_seeds_produce_different_embeddings(self, proj_seed):
        other_key = bytes([99] * 32)
        other_seed = derive_projection_seed(other_key)
        emb1 = generate_embedding64("same text", proj_seed)
        emb2 = generate_embedding64("same text", other_seed)
        assert emb1 != emb2


# =============================================================================
# Full Fingerprint Generation
# =============================================================================


class TestGenerateFingerprint:
    def test_produces_valid_fingerprint(self):
        fp = generate_fingerprint(
            "The user prefers dark mode and likes TypeScript",
            TEST_KEY,
        )

        assert isinstance(fp["topicHashes"], list)
        assert len(fp["topicHashes"]) > 0
        assert len(fp["topicHashes"]) <= 5

        assert fp["category"] == "preference"

        assert len(fp["embedding64"]) == 64
        norm = math.sqrt(sum(v * v for v in fp["embedding64"]))
        assert abs(norm - 1.0) < 0.01

        assert fp["temporalWeight"] == 1.0
        assert fp["version"] == 1

    def test_deterministic(self):
        fp1 = generate_fingerprint("test data for fingerprint", TEST_KEY)
        fp2 = generate_fingerprint("test data for fingerprint", TEST_KEY)
        assert fp1 == fp2

    def test_uses_context(self):
        fp = generate_fingerprint(
            "deploy the service to production",
            TEST_KEY,
            context="step process procedure",
        )
        assert fp["category"] == "procedure"

    def test_handles_dict_data(self):
        fp = generate_fingerprint(
            {"name": "Alice", "email": "alice@example.com", "birthday": "March 5"},
            TEST_KEY,
        )
        assert len(fp["topicHashes"]) > 0
        assert fp["category"] == "fact"

    def test_handles_empty_data(self):
        fp = generate_fingerprint("", TEST_KEY)
        assert fp["topicHashes"] == []
        assert fp["category"] == "unknown"
        assert len(fp["embedding64"]) == 64
        assert all(v == 0.0 for v in fp["embedding64"])

    def test_different_keys_produce_different_fingerprints(self):
        key2 = bytes([99] * 32)
        data = "The database migration process failed during the deployment procedure"
        fp1 = generate_fingerprint(data, TEST_KEY)
        fp2 = generate_fingerprint(data, key2)

        assert len(fp1["topicHashes"]) > 0
        assert len(fp2["topicHashes"]) > 0

        # Topic hashes should differ (different salt)
        assert fp1["topicHashes"] != fp2["topicHashes"]
        # Embeddings should differ (different projection seed)
        assert fp1["embedding64"] != fp2["embedding64"]
        # Category should be the same (not key-dependent)
        assert fp1["category"] == fp2["category"]

    def test_all_categories_are_valid(self):
        for cat in COGNITIVE_CATEGORIES:
            assert cat in (
                'preference', 'fact', 'event', 'procedure', 'relationship',
                'observation', 'decision', 'goal', 'constraint', 'reference',
                'summary', 'handoff', 'pattern', 'feedback', 'unknown',
            )
