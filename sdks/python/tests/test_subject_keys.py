"""Tests for Subject Keys Cryptographic Utilities."""

import os
import pytest
from xache.crypto.subject import (
    SubjectContext,
    SubjectDerivationOptions,
    SubjectRetrievalContext,
    derive_subject_id,
    is_valid_subject_id,
    is_valid_scope,
    create_subject_context,
    create_segment_context,
    create_global_context,
    validate_subject_context,
    derive_entity_key,
    batch_derive_subject_ids,
    batch_derive_entity_keys,
)


AGENT_KEY = os.urandom(32)


class TestDeriveSubjectId:
    def test_returns_64_hex_chars(self):
        result = derive_subject_id(AGENT_KEY, "user-123")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_deterministic(self):
        a = derive_subject_id(AGENT_KEY, "user-123")
        b = derive_subject_id(AGENT_KEY, "user-123")
        assert a == b

    def test_different_inputs_produce_different_outputs(self):
        a = derive_subject_id(AGENT_KEY, "user-123")
        b = derive_subject_id(AGENT_KEY, "user-456")
        assert a != b

    def test_different_keys_produce_different_outputs(self):
        key_a = os.urandom(32)
        key_b = os.urandom(32)
        a = derive_subject_id(key_a, "user-123")
        b = derive_subject_id(key_b, "user-123")
        assert a != b

    def test_custom_domain(self):
        default_result = derive_subject_id(AGENT_KEY, "user-123")
        custom_result = derive_subject_id(
            AGENT_KEY, "user-123",
            SubjectDerivationOptions(domain="custom:domain:v1"),
        )
        assert default_result != custom_result

    def test_rejects_invalid_key_length(self):
        with pytest.raises(ValueError, match="expected 32 bytes"):
            derive_subject_id(b"short", "user-123")


class TestIsValidSubjectId:
    def test_valid_id(self):
        sid = derive_subject_id(AGENT_KEY, "user-123")
        assert is_valid_subject_id(sid) is True

    def test_rejects_too_short(self):
        assert is_valid_subject_id("abc123") is False

    def test_rejects_non_hex(self):
        assert is_valid_subject_id("z" * 64) is False

    def test_rejects_uppercase(self):
        assert is_valid_subject_id("A" * 64) is False

    def test_rejects_non_string(self):
        assert is_valid_subject_id(12345) is False  # type: ignore[arg-type]


class TestIsValidScope:
    def test_subject_is_valid(self):
        assert is_valid_scope("SUBJECT") is True

    def test_segment_is_valid(self):
        assert is_valid_scope("SEGMENT") is True

    def test_global_is_valid(self):
        assert is_valid_scope("GLOBAL") is True

    def test_lowercase_invalid(self):
        assert is_valid_scope("subject") is False

    def test_random_string_invalid(self):
        assert is_valid_scope("CUSTOM") is False


class TestCreateSubjectContext:
    def test_creates_subject_context(self):
        sid = derive_subject_id(AGENT_KEY, "user-123")
        ctx = create_subject_context(sid)
        assert ctx.scope == "SUBJECT"
        assert ctx.subject_id == sid
        assert ctx.tenant_id is None

    def test_with_tenant_id(self):
        sid = derive_subject_id(AGENT_KEY, "user-123")
        ctx = create_subject_context(sid, tenant_id="tenant-abc")
        assert ctx.tenant_id == "tenant-abc"

    def test_rejects_invalid_subject_id(self):
        with pytest.raises(ValueError, match="Invalid subject ID"):
            create_subject_context("not-valid")


class TestCreateSegmentContext:
    def test_creates_segment_context(self):
        ctx = create_segment_context("premium-users")
        assert ctx.scope == "SEGMENT"
        assert ctx.segment_id == "premium-users"
        assert ctx.tenant_id is None

    def test_with_tenant_id(self):
        ctx = create_segment_context("premium-users", tenant_id="t1")
        assert ctx.tenant_id == "t1"

    def test_rejects_empty_segment_id(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            create_segment_context("")


class TestCreateGlobalContext:
    def test_creates_global_context(self):
        ctx = create_global_context()
        assert ctx.scope == "GLOBAL"
        assert ctx.subject_id is None
        assert ctx.segment_id is None
        assert ctx.tenant_id is None

    def test_with_tenant_id(self):
        ctx = create_global_context(tenant_id="t1")
        assert ctx.tenant_id == "t1"


class TestValidateSubjectContext:
    def test_valid_subject_context(self):
        sid = derive_subject_id(AGENT_KEY, "user-123")
        ctx = SubjectContext(scope="SUBJECT", subject_id=sid)
        validate_subject_context(ctx)  # Should not raise

    def test_valid_segment_context(self):
        ctx = SubjectContext(scope="SEGMENT", segment_id="seg-1")
        validate_subject_context(ctx)  # Should not raise

    def test_valid_global_context(self):
        ctx = SubjectContext(scope="GLOBAL")
        validate_subject_context(ctx)  # Should not raise

    def test_rejects_subject_without_id(self):
        ctx = SubjectContext(scope="SUBJECT")
        with pytest.raises(ValueError, match="subject_id is required"):
            validate_subject_context(ctx)

    def test_rejects_segment_without_id(self):
        ctx = SubjectContext(scope="SEGMENT")
        with pytest.raises(ValueError, match="segment_id is required"):
            validate_subject_context(ctx)

    def test_rejects_invalid_scope(self):
        ctx = SubjectContext(scope="INVALID")  # type: ignore[arg-type]
        with pytest.raises(ValueError, match="Invalid scope"):
            validate_subject_context(ctx)


class TestDeriveEntityKey:
    def test_returns_64_hex_chars(self):
        result = derive_entity_key(AGENT_KEY, "Alice Chen")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_case_insensitive(self):
        a = derive_entity_key(AGENT_KEY, "Alice Chen")
        b = derive_entity_key(AGENT_KEY, "alice chen")
        assert a == b

    def test_trims_whitespace(self):
        a = derive_entity_key(AGENT_KEY, "Alice Chen")
        b = derive_entity_key(AGENT_KEY, "  Alice Chen  ")
        assert a == b

    def test_different_from_subject_id(self):
        subject = derive_subject_id(AGENT_KEY, "alice chen")
        entity = derive_entity_key(AGENT_KEY, "alice chen")
        assert subject != entity  # Different domains


class TestBatchDeriveSubjectIds:
    def test_derives_all(self):
        ids = ["user-1", "user-2", "user-3"]
        results = batch_derive_subject_ids(AGENT_KEY, ids)
        assert len(results) == 3
        assert all(k in results for k in ids)
        assert all(is_valid_subject_id(v) for v in results.values())

    def test_matches_individual_derivation(self):
        ids = ["user-1", "user-2"]
        batch = batch_derive_subject_ids(AGENT_KEY, ids)
        for raw_id in ids:
            individual = derive_subject_id(AGENT_KEY, raw_id)
            assert batch[raw_id] == individual

    def test_rejects_invalid_key(self):
        with pytest.raises(ValueError, match="expected 32 bytes"):
            batch_derive_subject_ids(b"short", ["user-1"])

    def test_empty_list(self):
        results = batch_derive_subject_ids(AGENT_KEY, [])
        assert results == {}


class TestBatchDeriveEntityKeys:
    def test_derives_all(self):
        names = ["Alice Chen", "Bob Smith"]
        results = batch_derive_entity_keys(AGENT_KEY, names)
        assert len(results) == 2
        # Keys are normalized to lowercase
        assert "alice chen" in results
        assert "bob smith" in results

    def test_matches_individual_derivation(self):
        names = ["Alice Chen"]
        batch = batch_derive_entity_keys(AGENT_KEY, names)
        individual = derive_entity_key(AGENT_KEY, "Alice Chen")
        assert batch["alice chen"] == individual

    def test_rejects_invalid_key(self):
        with pytest.raises(ValueError, match="expected 32 bytes"):
            batch_derive_entity_keys(b"short", ["Alice"])
