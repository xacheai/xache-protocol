"""
MemoryService unit tests — Python SDK

Tests store validation, encryption/decryption, and list() method.
Uses mocks to avoid network calls.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch
from dataclasses import dataclass

import nacl.secret
import nacl.hash
import nacl.encoding

from xache.services.memory import MemoryService
from xache.types import APIResponse, MemoryListItem, ListMemoriesResponse


# ============================================================
# Helpers
# ============================================================

def make_mock_client(did="did:agent:evm:0xABC", private_key="0xdeadbeef"):
    """Create a mock XacheClient with required fields."""
    client = MagicMock()
    client.did = did
    client.private_key = private_key
    client.request = AsyncMock()
    client.request_with_payment = AsyncMock()
    return client


# ============================================================
# Tests — Store Validation
# ============================================================

class TestStoreValidation:
    def test_data_must_be_dict(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="data must be a dictionary"):
            service._validate_store_request("not a dict", "hot")

    def test_invalid_storage_tier(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="storage_tier"):
            service._validate_store_request({"key": "val"}, "invalid_tier")

    def test_valid_tiers_accepted(self):
        service = MemoryService(make_mock_client())
        for tier in ["hot", "warm", "cold"]:
            service._validate_store_request({"key": "val"}, tier)  # Should not raise

    def test_data_too_large(self):
        service = MemoryService(make_mock_client())
        large_data = {"key": "x" * 500}
        with pytest.raises(ValueError, match="data too large"):
            service._validate_store_request(large_data, "hot")


# ============================================================
# Tests — Encryption
# ============================================================

class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        service = MemoryService(make_mock_client())
        key = service._derive_encryption_key()

        original = {"name": "Alice", "score": 42, "nested": {"a": True}}
        encrypted = service._encrypt_data(original, key)

        # Encrypted data should be base64 string, different from original
        assert isinstance(encrypted, str)
        assert encrypted != json.dumps(original)

        # Decrypt should return exact original
        decrypted = service._decrypt_data(encrypted, key)
        assert decrypted == original

    def test_different_keys_produce_different_ciphertext(self):
        service1 = MemoryService(make_mock_client(did="did:agent:evm:0x111", private_key="0xkey1"))
        service2 = MemoryService(make_mock_client(did="did:agent:evm:0x222", private_key="0xkey2"))

        key1 = service1._derive_encryption_key()
        key2 = service2._derive_encryption_key()

        data = {"test": "data"}
        enc1 = service1._encrypt_data(data, key1)
        enc2 = service2._encrypt_data(data, key2)

        # Different keys = different ciphertext
        assert enc1 != enc2

    def test_wrong_key_fails_to_decrypt(self):
        service1 = MemoryService(make_mock_client(did="did:agent:evm:0x111", private_key="0xkey1"))
        service2 = MemoryService(make_mock_client(did="did:agent:evm:0x222", private_key="0xkey2"))

        key1 = service1._derive_encryption_key()
        key2 = service2._derive_encryption_key()

        data = {"secret": "message"}
        encrypted = service1._encrypt_data(data, key1)

        with pytest.raises(Exception):
            service2._decrypt_data(encrypted, key2)

    def test_key_is_32_bytes(self):
        service = MemoryService(make_mock_client())
        key = service._derive_encryption_key()
        assert len(key) == nacl.secret.SecretBox.KEY_SIZE  # 32

    def test_set_custom_encryption_key(self):
        service = MemoryService(make_mock_client())
        custom_key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)
        service.set_encryption_key(custom_key)

        data = {"custom": "key test"}
        encrypted = service._encrypt_data(data, custom_key)
        decrypted = service._decrypt_data(encrypted, custom_key)
        assert decrypted == data

    def test_set_invalid_key_length(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="Key must be"):
            service.set_encryption_key(b"tooshort")


# ============================================================
# Tests — Store
# ============================================================

class TestStore:
    @pytest.mark.asyncio
    async def test_store_basic(self):
        client = make_mock_client()
        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "memoryId": "mem_abc",
                "storageTier": "hot",
                "size": 128,
                "receiptId": "rcpt_xyz",
            },
        )

        service = MemoryService(client)
        result = await service.store(
            data={"greeting": "hello"},
            storage_tier="hot",
        )

        assert result.memory_id == "mem_abc"
        assert result.storage_tier == "hot"
        assert result.receipt_id == "rcpt_xyz"

        # Verify encrypted data was sent (not plaintext)
        call_args = client.request_with_payment.call_args
        body = call_args[0][2]  # 3rd positional arg
        assert "encryptedData" in body
        assert body["storageTier"] == "hot"

    @pytest.mark.asyncio
    async def test_store_with_context_and_tags(self):
        client = make_mock_client()
        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "memoryId": "mem_ctx",
                "storageTier": "warm",
                "size": 64,
                "receiptId": "rcpt_ctx",
            },
        )

        service = MemoryService(client)
        await service.store(
            data={"key": "val"},
            storage_tier="warm",
            context="graph:entity",
            tags=["person", "v1"],
            subject_id="subj_123",
            scope="SUBJECT",
        )

        body = client.request_with_payment.call_args[0][2]
        assert body["context"] == "graph:entity"
        assert body["tags"] == ["person", "v1"]
        assert body["subjectId"] == "subj_123"
        assert body["scope"] == "SUBJECT"

    @pytest.mark.asyncio
    async def test_store_with_immediate_anchoring(self):
        client = make_mock_client()
        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "memoryId": "mem_anch",
                "storageTier": "hot",
                "size": 64,
                "receiptId": "rcpt_anch",
                "anchoringTier": "immediate",
                "anchoringStatus": "queued",
                "estimatedAnchorTime": "2026-01-01T00:05:00Z",
            },
        )

        service = MemoryService(client)
        result = await service.store(
            data={"key": "val"},
            storage_tier="hot",
            anchoring="immediate",
        )

        body = client.request_with_payment.call_args[0][2]
        assert body["anchoring"] == "immediate"
        assert result.anchoring_tier == "immediate"
        assert result.anchoring_status == "queued"


# ============================================================
# Tests — Retrieve
# ============================================================

class TestRetrieve:
    @pytest.mark.asyncio
    async def test_retrieve_decrypts_data(self):
        client = make_mock_client()
        service = MemoryService(client)
        key = service._derive_encryption_key()

        original_data = {"secret": "message", "count": 7}
        encrypted = service._encrypt_data(original_data, key)

        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "memoryId": "mem_ret",
                "encryptedData": encrypted,
                "storageTier": "hot",
                "metadata": {"tag": "test"},
                "receiptId": "rcpt_ret",
            },
        )

        result = await service.retrieve("mem_ret")
        assert result.memory_id == "mem_ret"
        assert result.data == original_data
        assert result.storage_tier == "hot"
        assert result.receipt_id == "rcpt_ret"

    @pytest.mark.asyncio
    async def test_retrieve_requires_memory_id(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="memory_id is required"):
            await service.retrieve("")


# ============================================================
# Tests — Delete
# ============================================================

class TestDelete:
    @pytest.mark.asyncio
    async def test_delete_success(self):
        client = make_mock_client()
        client.request.return_value = APIResponse(
            success=True,
            data={"deleted": True, "memoryId": "mem_del"},
        )

        service = MemoryService(client)
        result = await service.delete("mem_del")
        assert result["deleted"] is True

        # Verify DELETE method and correct URL
        call_args = client.request.call_args
        assert call_args[0][0] == "DELETE"
        assert "/v1/memory/mem_del" in call_args[0][1]

    @pytest.mark.asyncio
    async def test_delete_requires_memory_id(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="memory_id is required"):
            await service.delete("")


# ============================================================
# Tests — List
# ============================================================

class TestList:
    @pytest.mark.asyncio
    async def test_list_default_params(self):
        client = make_mock_client()
        client.request.return_value = APIResponse(
            success=True,
            data={
                "memories": [
                    {
                        "storageKey": "mem_1",
                        "agentDID": "did:agent:evm:0xABC",
                        "storageTier": "hot",
                        "encryptedSize": 128,
                        "createdAt": "2026-01-01T00:00:00Z",
                        "accessedAt": "2026-01-02T00:00:00Z",
                        "context": "general",
                        "tags": ["test"],
                    }
                ],
                "total": 1,
                "limit": 50,
                "offset": 0,
            },
        )

        service = MemoryService(client)
        result = await service.list()

        assert result.total == 1
        assert len(result.memories) == 1
        assert result.memories[0].storage_key == "mem_1"
        assert result.memories[0].context == "general"
        assert result.memories[0].tags == ["test"]

        # Default params: no query string args except defaults
        url = client.request.call_args[0][1]
        assert "/v1/memory" in url

    @pytest.mark.asyncio
    async def test_list_with_filters(self):
        client = make_mock_client()
        client.request.return_value = APIResponse(
            success=True,
            data={"memories": [], "total": 0, "limit": 10, "offset": 0},
        )

        service = MemoryService(client)
        await service.list(
            context="graph:entity",
            tier="hot",
            limit=10,
            offset=5,
            subject_id="subj_abc",
            scope="SUBJECT",
        )

        url = client.request.call_args[0][1]
        assert "context=graph:entity" in url
        assert "tier=hot" in url
        assert "limit=10" in url
        assert "offset=5" in url
        assert "subjectId=subj_abc" in url
        assert "scope=SUBJECT" in url

    @pytest.mark.asyncio
    async def test_list_with_metadata(self):
        client = make_mock_client()
        client.request.return_value = APIResponse(
            success=True,
            data={
                "memories": [
                    {
                        "storageKey": "mem_meta",
                        "agentId": "did:agent:evm:0x123",  # agentId fallback
                        "storageTier": "warm",
                        "sizeBytes": 256,  # sizeBytes fallback
                        "createdAt": "2026-01-01T00:00:00Z",
                        "accessedAt": "2026-01-01T00:00:00Z",
                        "metadata": {"entityKey": "k_alice", "type": "person"},
                        "updatedAt": "2026-01-02T00:00:00Z",
                    }
                ],
                "total": 1,
                "limit": 50,
                "offset": 0,
            },
        )

        service = MemoryService(client)
        result = await service.list()

        mem = result.memories[0]
        assert mem.agent_did == "did:agent:evm:0x123"  # agentId fallback
        assert mem.size_bytes == 256  # sizeBytes fallback
        assert mem.metadata == {"entityKey": "k_alice", "type": "person"}
        assert mem.updated_at == "2026-01-02T00:00:00Z"


# ============================================================
# Tests — Batch Store
# ============================================================

class TestBatchStore:
    @pytest.mark.asyncio
    async def test_batch_store_validates_empty(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="cannot be empty"):
            await service.store_batch([])

    @pytest.mark.asyncio
    async def test_batch_store_validates_max_100(self):
        service = MemoryService(make_mock_client())
        items = [{"data": {"k": "v"}, "storage_tier": "hot"}] * 101
        with pytest.raises(ValueError, match="maximum of 100"):
            await service.store_batch(items)

    @pytest.mark.asyncio
    async def test_batch_store_validates_items(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="Invalid item at index 0"):
            await service.store_batch([{"data": "not_dict", "storage_tier": "hot"}])

    @pytest.mark.asyncio
    async def test_batch_store_success(self):
        client = make_mock_client()
        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "results": [
                    {"index": 0, "memoryId": "mem_b1", "receiptId": "rcpt_b1"},
                    {"index": 1, "memoryId": "mem_b2", "receiptId": "rcpt_b2"},
                ],
                "successCount": 2,
                "failureCount": 0,
                "batchReceiptId": "batch_rcpt",
            },
        )

        service = MemoryService(client)
        result = await service.store_batch([
            {"data": {"a": 1}, "storage_tier": "hot"},
            {"data": {"b": 2}, "storage_tier": "warm"},
        ])

        assert result.success_count == 2
        assert result.failure_count == 0
        assert result.batch_receipt_id == "batch_rcpt"
        assert len(result.results) == 2
        assert result.results[0].memory_id == "mem_b1"


# ============================================================
# Tests — Batch Retrieve
# ============================================================

class TestBatchRetrieve:
    @pytest.mark.asyncio
    async def test_batch_retrieve_validates_empty(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="cannot be empty"):
            await service.retrieve_batch([])

    @pytest.mark.asyncio
    async def test_batch_retrieve_validates_max_100(self):
        service = MemoryService(make_mock_client())
        with pytest.raises(ValueError, match="maximum of 100"):
            await service.retrieve_batch(["mem"] * 101)

    @pytest.mark.asyncio
    async def test_batch_retrieve_decrypts_all(self):
        client = make_mock_client()
        service = MemoryService(client)
        key = service._derive_encryption_key()

        data1 = {"name": "Alice"}
        data2 = {"name": "Bob"}

        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "results": [
                    {"index": 0, "memoryId": "mem_1", "encryptedData": service._encrypt_data(data1, key),
                     "storageTier": "hot", "receiptId": "rcpt_1"},
                    {"index": 1, "memoryId": "mem_2", "encryptedData": service._encrypt_data(data2, key),
                     "storageTier": "warm", "receiptId": "rcpt_2"},
                ],
                "successCount": 2,
                "failureCount": 0,
                "batchReceiptId": "batch_rcpt",
            },
        )

        result = await service.retrieve_batch(["mem_1", "mem_2"])
        assert result.success_count == 2
        assert result.results[0].data == data1
        assert result.results[1].data == data2

    @pytest.mark.asyncio
    async def test_batch_retrieve_handles_partial_failure(self):
        client = make_mock_client()
        service = MemoryService(client)
        key = service._derive_encryption_key()

        client.request_with_payment.return_value = APIResponse(
            success=True,
            data={
                "results": [
                    {"index": 0, "memoryId": "mem_1", "encryptedData": service._encrypt_data({"ok": True}, key),
                     "storageTier": "hot", "receiptId": "rcpt_1"},
                    {"index": 1, "memoryId": "mem_bad", "error": "Not found"},
                ],
                "successCount": 1,
                "failureCount": 1,
                "batchReceiptId": "batch_rcpt",
            },
        )

        result = await service.retrieve_batch(["mem_1", "mem_bad"])
        assert result.results[0].data == {"ok": True}
        assert result.results[1].error == "Not found"
        assert result.results[1].data is None
