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
    MemoryListItem,
    ListMemoriesResponse,
)
from ..crypto.fingerprint import generate_fingerprint


class MemoryService:
    """Memory service for encrypted data storage"""

    def __init__(self, client: Any) -> None:
        self.client = client
        self._encryption_key: Optional[bytes] = None

    async def store(
        self,
        data: Dict[str, Any],
        storage_tier: str,
        metadata: Optional[Dict[str, Any]] = None,
        anchoring: Optional[str] = None,
        context: Optional[str] = None,
        tags: Optional[List[str]] = None,
        subject_id: Optional[str] = None,
        scope: Optional[str] = None,
        segment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        fingerprint: Optional[bool] = None,
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

        # Add context and tags
        if context:
            request_body["context"] = context
        if tags:
            request_body["tags"] = tags

        # Add Subject Keys fields
        if subject_id:
            request_body["subjectId"] = subject_id
        if scope:
            request_body["scope"] = scope
        if segment_id:
            request_body["segmentId"] = segment_id
        if tenant_id:
            request_body["tenantId"] = tenant_id

        if anchoring == "immediate":
            request_body["anchoring"] = "immediate"

        # Generate cognitive fingerprint (unless opt-out)
        if fingerprint is not False:
            fp = generate_fingerprint(data, key, context)
            request_body["fingerprint"] = fp

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

        result: Dict[str, Any] = response.data
        return result

    async def list(
        self,
        context: Optional[str] = None,
        tier: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "created",
        subject_id: Optional[str] = None,
        scope: Optional[str] = None,
        segment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> ListMemoriesResponse:
        """
        List memories for authenticated agent (free, no payment)

        Args:
            context: Filter by context string
            tier: Filter by storage tier
            limit: Max results (default 50, max 100)
            offset: Pagination offset
            sort_by: Sort order ('created', 'accessed', 'size')
            subject_id: Filter by subject ID
            scope: Filter by scope ('SUBJECT', 'SEGMENT', 'GLOBAL')
            segment_id: Filter by segment ID
            tenant_id: Filter by tenant ID

        Returns:
            ListMemoriesResponse with memories list and pagination
        """
        params = []
        if context:
            params.append(f"context={context}")
        if tier:
            params.append(f"tier={tier}")
        if limit != 50:
            params.append(f"limit={limit}")
        if offset:
            params.append(f"offset={offset}")
        if sort_by != "created":
            params.append(f"sortBy={sort_by}")
        if subject_id:
            params.append(f"subjectId={subject_id}")
        if scope:
            params.append(f"scope={scope}")
        if segment_id:
            params.append(f"segmentId={segment_id}")
        if tenant_id:
            params.append(f"tenantId={tenant_id}")

        query = "&".join(params)
        url = f"/v1/memory{'?' + query if query else ''}"

        response = await self.client.request("GET", url)

        if not response.success or not response.data:
            raise Exception("Memory list failed")

        resp_data = response.data
        memories = [
            MemoryListItem(
                storage_key=m.get("storageKey", ""),
                agent_did=m.get("agentDID", m.get("agentId", "")),
                storage_tier=m.get("storageTier", "hot"),
                size_bytes=m.get("encryptedSize", m.get("sizeBytes", 0)),
                created_at=m.get("createdAt", ""),
                accessed_at=m.get("accessedAt", ""),
                context=m.get("context"),
                tags=m.get("tags"),
                metadata=m.get("metadata"),
                updated_at=m.get("updatedAt"),
            )
            for m in resp_data.get("memories", [])
        ]

        return ListMemoriesResponse(
            memories=memories,
            total=resp_data.get("total", len(memories)),
            limit=resp_data.get("limit", limit),
            offset=resp_data.get("offset", offset),
        )

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

    async def probe(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10,
        scope: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Probe memories using cognitive fingerprints (zero-knowledge semantic search).
        Free operation (no payment required).

        Generates a probe fingerprint from the query text client-side, sends hashed
        shadows to the server for matching, then batch retrieves + decrypts matches.

        Args:
            query: Natural language query text
            category: Optional cognitive category filter
            limit: Maximum number of results (default: 10, max: 50)
            scope: Optional scope filter dict

        Returns:
            Dict with matches (list of {storageKey, category, data}), total

        Example:
            ```python
            results = await client.memory.probe("user dark mode preferences")
            for m in results["matches"]:
                print(f"[{m['category']}] {m['storageKey']}: {m.get('data')}")
            ```
        """
        key = await self._get_encryption_key()
        fp = generate_fingerprint({"query": query}, key)

        # POST /v1/memory/probe (free — no payment required)
        request_body: Dict[str, Any] = {
            "topicHashes": fp["topicHashes"],
            "embedding64": fp["embedding64"],
            "version": fp["version"],
            "limit": limit,
        }
        if category:
            request_body["category"] = category
        if scope:
            request_body["scope"] = scope

        response = await self.client.request(
            "POST",
            "/v1/memory/probe",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Memory probe failed")

        resp_data = response.data
        matches = resp_data.get("matches", [])

        # Batch retrieve + decrypt matched memories
        if matches:
            storage_keys = [m["storageKey"] for m in matches]
            retrieved = await self.retrieve_batch(storage_keys)

            data_map: Dict[str, Any] = {}
            for result in retrieved.results:
                if result.memory_id and result.data:
                    data_map[result.memory_id] = result.data

            enriched_matches = []
            for m in matches:
                enriched_matches.append({
                    "storageKey": m["storageKey"],
                    "category": m["category"],
                    "data": data_map.get(m["storageKey"]),
                })

            return {
                "matches": enriched_matches,
                "total": resp_data.get("total", len(matches)),
            }

        return {"matches": [], "total": 0}

    def _validate_store_request(self, data: Any, storage_tier: Any) -> None:
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
            self._encryption_key = await self._derive_encryption_key()
        return self._encryption_key

    async def _derive_encryption_key(self) -> bytes:
        """
        Derive encryption key from signing adapter using PyNaCl.
        Uses BLAKE2b hash function for deterministic key derivation.
        Routes through signing adapter to support privateKey, signer, and walletProvider modes.
        """
        adapter = self.client.signing_adapter

        # Get encryption seed from adapter:
        # - PrivateKey mode: returns private_key (identical to existing behavior)
        # - External signer with encryption_key: returns encryption_key
        # - External signer fallback: returns wallet address
        seed = await adapter.get_encryption_seed()

        # Warn if using address-derived fallback
        if not adapter.has_private_key():
            import warnings
            warnings.warn(
                "[Xache] Using external signer without encryption_key config. "
                "Encryption key will be derived from wallet address, NOT a private key. "
                "Existing encrypted memories from private_key mode will NOT be decryptable. "
                "To maintain compatibility, pass encryption_key to XacheClient.",
                stacklevel=2,
            )

        key_material = (seed or '') + self.client.did
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
        result: Dict[str, Any] = json.loads(json_str)
        return result

    def set_encryption_key(self, key: bytes) -> None:
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

    # ========== Memory Management (Restore / Purge / List Deleted) ==========

    async def restore(self, storage_key: str) -> Dict[str, Any]:
        """
        Restore a soft-deleted memory (clears deleted_at)
        Free (no payment required)

        Args:
            storage_key: The storage key of the deleted memory

        Returns:
            Dict with storageKey and restored status

        Example:
            ```python
            result = await client.memory.restore("mem_abc123_xyz")
            print(f"Restored: {result['restored']}")
            ```
        """
        if not storage_key:
            raise ValueError("storage_key is required")

        response = await self.client.request(
            "POST", f"/v1/memory/{storage_key}/restore"
        )

        if not response.success or not response.data:
            raise Exception("Memory restore failed")

        result: Dict[str, Any] = response.data
        return result

    async def purge(self, storage_key: str) -> Dict[str, Any]:
        """
        Permanently purge a memory (hard delete R2 blob + DB row)
        Receipts are preserved for audit trail. This is irreversible.
        Free (no payment required)

        Args:
            storage_key: The storage key of the memory to purge

        Returns:
            Dict with storageKey, purged, and r2Deleted status

        Example:
            ```python
            result = await client.memory.purge("mem_abc123_xyz")
            print(f"Purged: {result['purged']}, R2 deleted: {result['r2Deleted']}")
            ```
        """
        if not storage_key:
            raise ValueError("storage_key is required")

        response = await self.client.request(
            "DELETE", f"/v1/memory/{storage_key}/purge"
        )

        if not response.success or not response.data:
            raise Exception("Memory purge failed")

        result: Dict[str, Any] = response.data
        return result

    async def list_deleted(
        self,
        agent_did: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List soft-deleted memories for recovery
        Free (no payment required)

        Args:
            agent_did: Agent DID (required for owner access)
            limit: Max results (default 50, max 100)
            offset: Pagination offset

        Returns:
            Dict with memories list, total, limit, offset

        Example:
            ```python
            result = await client.memory.list_deleted(limit=20)
            print(f"Deleted memories: {result['total']}")
            for m in result['memories']:
                print(f"  {m['storageKey']} deleted at {m['deletedAt']}")
            ```
        """
        params = []
        if agent_did:
            params.append(f"agentDID={agent_did}")
        if limit != 50:
            params.append(f"limit={limit}")
        if offset:
            params.append(f"offset={offset}")

        query = "&".join(params)
        url = f"/v1/memory/deleted{'?' + query if query else ''}"

        response = await self.client.request("GET", url)

        if not response.success or not response.data:
            raise Exception("List deleted memories failed")

        result: Dict[str, Any] = response.data
        return result
