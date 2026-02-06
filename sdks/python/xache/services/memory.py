"""Memory Service - Store, retrieve, delete encrypted memories per LLD §2.4"""

import json
import hashlib
from typing import Dict, Any, Optional, List

import nacl.secret
import nacl.utils
import nacl.hash

from ..types import (
    StoreMemoryRequest,
    StoreMemoryResponse,
    RetrieveMemoryResponse,
    BatchStoreMemoryRequest,
    BatchStoreMemoryResponse,
    BatchStoreMemoryResult,
    BatchRetrieveMemoryRequest,
    BatchRetrieveMemoryResponse,
    BatchRetrieveMemoryResult,
)


class MemoryService:
    """Memory service for encrypted data storage"""

    def __init__(self, client):
        self.client = client
        self._encryption_key: Optional[bytes] = None

    async def store(
        self,
        data: Dict[str, Any],
        storage_tier: str,
        metadata: Optional[Dict[str, Any]] = None,
        anchoring: Optional[str] = None,
    ) -> StoreMemoryResponse:
        """
        Store encrypted memory per LLD §2.4
        Cost: $0.01 (automatic 402 payment)

        Example:
            ```python
            memory = await client.memory.store(
                data={"key": "value", "nested": {"data": 123}},
                storage_tier="hot",
                metadata={"tags": ["important"]},
            )
            print(f"Memory ID: {memory.memory_id}")
            ```
        """
        # Validate request
        self._validate_store_request(data, storage_tier)

        # Get encryption key
        key = await self._get_encryption_key()

        # Encrypt data client-side using PyNaCl
        encrypted_data = self._encrypt_data(data, key)

        # Build request body
        request_body: Dict[str, Any] = {
            "encryptedData": encrypted_data,
            "storageTier": storage_tier,
            "metadata": metadata,
        }
        if anchoring == "immediate":
            request_body["anchoring"] = "immediate"

        # Make API request with automatic 402 payment
        response = await self.client.request_with_payment(
            "POST",
            "/v1/memory/store",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Memory store failed")

        resp_data = response.data
        return StoreMemoryResponse(
            memory_id=resp_data["memoryId"],
            storage_tier=resp_data["storageTier"],
            size=resp_data["size"],
            receipt_id=resp_data["receiptId"],
            anchoring_tier=resp_data.get("anchoringTier"),
            anchoring_status=resp_data.get("anchoringStatus"),
            estimated_anchor_time=resp_data.get("estimatedAnchorTime"),
        )

    async def retrieve(self, memory_id: str, anchoring: Optional[str] = None) -> RetrieveMemoryResponse:
        """
        Retrieve encrypted memory per LLD §2.4
        Cost: $0.005 (automatic 402 payment)
        """
        if not memory_id:
            raise ValueError("memory_id is required")

        # Build request body
        retrieve_body: Dict[str, Any] = {"memoryId": memory_id}
        if anchoring == "immediate":
            retrieve_body["anchoring"] = "immediate"

        # Make API request with automatic 402 payment
        response = await self.client.request_with_payment(
            "POST",
            "/v1/memory/retrieve",
            retrieve_body,
        )

        if not response.success or not response.data:
            raise Exception("Memory retrieve failed")

        resp_data = response.data

        # Get encryption key
        key = await self._get_encryption_key()

        # Decrypt data client-side
        decrypted_data = self._decrypt_data(resp_data["encryptedData"], key)

        return RetrieveMemoryResponse(
            memory_id=resp_data["memoryId"],
            data=decrypted_data,
            storage_tier=resp_data["storageTier"],
            metadata=resp_data.get("metadata"),
            receipt_id=resp_data["receiptId"],
            anchoring_tier=resp_data.get("anchoringTier"),
            anchoring_status=resp_data.get("anchoringStatus"),
            estimated_anchor_time=resp_data.get("estimatedAnchorTime"),
        )

    async def delete(self, memory_id: str) -> Dict[str, Any]:
        """Delete memory per LLD §2.4 (free)"""
        if not memory_id:
            raise ValueError("memory_id is required")

        response = await self.client.request(
            "DELETE",
            f"/v1/memory/{memory_id}",
        )

        if not response.success or not response.data:
            raise Exception("Memory delete failed")

        return response.data

    async def store_batch(
        self,
        items: List[Dict[str, Any]],
    ) -> BatchStoreMemoryResponse:
        """
        Batch store encrypted memories per PRD FR-010, LLD §2.3
        Max 100 items per batch
        Cost: Single 402 payment for entire batch

        Example:
            ```python
            result = await client.memory.store_batch([
                {"data": {"key": "value1"}, "storage_tier": "hot"},
                {"data": {"key": "value2"}, "storage_tier": "warm"},
                {"data": {"key": "value3"}, "storage_tier": "cold"},
            ])

            print(f"Success: {result.success_count}, Failed: {result.failure_count}")
            for r in result.results:
                if r.memory_id:
                    print(f"Stored: {r.memory_id}")
                else:
                    print(f"Failed: {r.error}")
            ```
        """
        # Validate batch request
        if not isinstance(items, list):
            raise ValueError("items must be a list")

        if len(items) == 0:
            raise ValueError("items list cannot be empty")

        if len(items) > 100:
            raise ValueError("batch size exceeds maximum of 100 items")

        # Validate each item
        for idx, item in enumerate(items):
            try:
                self._validate_store_request(item.get("data"), item.get("storage_tier"))
            except Exception as e:
                raise ValueError(f"Invalid item at index {idx}: {str(e)}")

        # Get encryption key
        key = await self._get_encryption_key()

        # Encrypt all items client-side
        encrypted_items = []
        for item in items:
            encrypted_data = self._encrypt_data(item["data"], key)
            encrypted_items.append({
                "encryptedData": encrypted_data,
                "storageTier": item["storage_tier"],
                "metadata": item.get("metadata"),
            })

        # Make API request with automatic 402 payment
        response = await self.client.request_with_payment(
            "POST",
            "/v1/memory/store/batch",
            {"items": encrypted_items},
        )

        if not response.success or not response.data:
            raise Exception("Batch memory store failed")

        resp_data = response.data

        # Convert results to dataclass instances
        results = [
            BatchStoreMemoryResult(
                index=r["index"],
                memory_id=r.get("memoryId"),
                receipt_id=r.get("receiptId"),
                error=r.get("error"),
            )
            for r in resp_data["results"]
        ]

        return BatchStoreMemoryResponse(
            results=results,
            success_count=resp_data["successCount"],
            failure_count=resp_data["failureCount"],
            batch_receipt_id=resp_data["batchReceiptId"],
        )

    async def retrieve_batch(
        self,
        memory_ids: List[str],
    ) -> BatchRetrieveMemoryResponse:
        """
        Batch retrieve encrypted memories per PRD FR-011, LLD §2.3
        Max 100 items per batch
        Cost: Single 402 payment for entire batch

        Example:
            ```python
            result = await client.memory.retrieve_batch([
                "mem_abc123",
                "mem_def456",
                "mem_ghi789",
            ])

            print(f"Success: {result.success_count}, Failed: {result.failure_count}")
            for r in result.results:
                if r.data:
                    print(f"Retrieved: {r.memory_id}, {r.data}")
                else:
                    print(f"Failed: {r.error}")
            ```
        """
        # Validate batch request
        if not isinstance(memory_ids, list):
            raise ValueError("memory_ids must be a list")

        if len(memory_ids) == 0:
            raise ValueError("memory_ids list cannot be empty")

        if len(memory_ids) > 100:
            raise ValueError("batch size exceeds maximum of 100 items")

        # Validate each memoryId
        for idx, memory_id in enumerate(memory_ids):
            if not memory_id or not isinstance(memory_id, str):
                raise ValueError(f"Invalid memory_id at index {idx}")

        # Make API request with automatic 402 payment
        response = await self.client.request_with_payment(
            "POST",
            "/v1/memory/retrieve/batch",
            {"memoryIds": memory_ids},
        )

        if not response.success or not response.data:
            raise Exception("Batch memory retrieve failed")

        resp_data = response.data

        # Get encryption key
        key = await self._get_encryption_key()

        # Decrypt all successfully retrieved items
        results = []
        for result in resp_data["results"]:
            # If retrieval failed, return error as-is
            if result.get("error") or not result.get("encryptedData"):
                results.append(
                    BatchRetrieveMemoryResult(
                        index=result["index"],
                        memory_id=result.get("memoryId"),
                        error=result.get("error") or "No data returned",
                    )
                )
                continue

            # Decrypt the data
            try:
                decrypted_data = self._decrypt_data(result["encryptedData"], key)
                results.append(
                    BatchRetrieveMemoryResult(
                        index=result["index"],
                        memory_id=result.get("memoryId"),
                        data=decrypted_data,
                        storage_tier=result.get("storageTier"),
                        metadata=result.get("metadata"),
                        receipt_id=result.get("receiptId"),
                    )
                )
            except Exception as e:
                results.append(
                    BatchRetrieveMemoryResult(
                        index=result["index"],
                        memory_id=result.get("memoryId"),
                        error=f"Decryption failed: {str(e)}",
                    )
                )

        return BatchRetrieveMemoryResponse(
            results=results,
            success_count=resp_data["successCount"],
            failure_count=resp_data["failureCount"],
            batch_receipt_id=resp_data["batchReceiptId"],
        )

    def _validate_store_request(self, data: Dict[str, Any], storage_tier: str):
        """Validate store request"""
        if not isinstance(data, dict):
            raise ValueError("data must be a dictionary")

        if storage_tier not in ["hot", "warm", "cold"]:
            raise ValueError('storage_tier must be "hot", "warm", or "cold"')

        # Validate data size
        json_str = json.dumps(data)
        if len(json_str) > 400:
            raise ValueError("data too large (max ~400 characters)")

    async def _get_encryption_key(self) -> bytes:
        """Get or derive encryption key"""
        if self._encryption_key is None:
            self._encryption_key = self._derive_encryption_key()
        return self._encryption_key

    def _derive_encryption_key(self) -> bytes:
        """
        Derive encryption key from client configuration using PyNaCl
        Uses BLAKE2b hash function for deterministic key derivation
        """
        key_material = self.client.private_key + self.client.did
        key_material_bytes = key_material.encode('utf-8')

        # Use BLAKE2b for deterministic key derivation (32 bytes for SecretBox)
        key = nacl.hash.blake2b(
            key_material_bytes,
            digest_size=nacl.secret.SecretBox.KEY_SIZE,
            encoder=nacl.encoding.RawEncoder
        )

        return key

    def _encrypt_data(self, data: Dict[str, Any], key: bytes) -> str:
        """
        Encrypt data using PyNaCl SecretBox (XSalsa20-Poly1305)
        """
        import base64

        # Convert data to JSON bytes
        json_str = json.dumps(data)
        json_bytes = json_str.encode('utf-8')

        # Create SecretBox with key
        box = nacl.secret.SecretBox(key)

        # Encrypt (nonce is automatically generated and prepended)
        encrypted = box.encrypt(json_bytes)

        # Return base64 encoded ciphertext (includes nonce)
        return base64.b64encode(encrypted).decode('utf-8')

    def _decrypt_data(self, encrypted_data: str, key: bytes) -> Dict[str, Any]:
        """
        Decrypt data using PyNaCl SecretBox
        """
        import base64

        # Decode from base64
        encrypted_bytes = base64.b64decode(encrypted_data)

        # Create SecretBox with key
        box = nacl.secret.SecretBox(key)

        # Decrypt (nonce is automatically extracted from ciphertext)
        decrypted_bytes = box.decrypt(encrypted_bytes)

        # Convert to JSON
        json_str = decrypted_bytes.decode('utf-8')
        return json.loads(json_str)

    def set_encryption_key(self, key: bytes):
        """
        Set custom encryption key
        Useful for testing or using external key management
        """
        if len(key) != nacl.secret.SecretBox.KEY_SIZE:
            raise ValueError(f"Key must be {nacl.secret.SecretBox.KEY_SIZE} bytes")
        self._encryption_key = key

    async def get_current_encryption_key(self) -> bytes:
        """
        Get current encryption key (for backup purposes)
        """
        return await self._get_encryption_key()
