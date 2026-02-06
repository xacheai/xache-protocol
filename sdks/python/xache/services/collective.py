"""Collective Service - Contribute and query heuristics per LLD §2.5"""

from typing import List, Optional
from ..types import (
    ContributeHeuristicRequest,
    ContributeHeuristicResponse,
    QueryCollectiveResponse,
    HeuristicMatch,
    HeuristicMetrics,
)


class CollectiveService:
    """Collective service for heuristic marketplace"""

    def __init__(self, client):
        self.client = client

    async def contribute(
        self,
        pattern: str,
        pattern_hash: str,
        domain: str,
        tags: List[str],
        metrics: HeuristicMetrics,
        encrypted_content_ref: str,
        context_type: Optional[str] = None,
        metadata: Optional[dict] = None,
        anchoring: Optional[str] = None,
    ) -> ContributeHeuristicResponse:
        """
        Contribute a heuristic to the collective per LLD §2.5
        Cost: $0.001 (automatic 402 payment)

        Args:
            pattern: Pattern text (10-500 chars)
            pattern_hash: Hash of pattern for deduplication
            domain: Domain (e.g., 'javascript', 'python', 'devops')
            tags: Tags for categorization (1-10 tags)
            metrics: Heuristic metrics (success_rate, sample_size, confidence)
            encrypted_content_ref: Reference to encrypted content in R2
            context_type: Optional context type
            metadata: Optional metadata
        """
        self._validate_contribute_request(
            pattern, pattern_hash, domain, tags, metrics, encrypted_content_ref
        )

        request_body = {
            "pattern": pattern,
            "patternHash": pattern_hash,
            "domain": domain,
            "tags": tags,
            "metrics": {
                "successRate": metrics.success_rate,
                "sampleSize": metrics.sample_size,
                "confidence": metrics.confidence,
            },
            "encryptedContentRef": encrypted_content_ref,
            "contextType": context_type,
            "metadata": metadata,
        }
        if anchoring == "immediate":
            request_body["anchoring"] = "immediate"

        response = await self.client.request_with_payment(
            "POST",
            "/v1/collective/contribute",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Heuristic contribution failed")

        data = response.data
        return ContributeHeuristicResponse(
            heuristic_id=data["heuristicId"],
            pattern=data["pattern"],
            domain=data["domain"],
            tags=data["tags"],
            receipt_id=data["receiptId"],
            anchoring_tier=data.get("anchoringTier"),
            anchoring_status=data.get("anchoringStatus"),
            estimated_anchor_time=data.get("estimatedAnchorTime"),
        )

    async def query(
        self,
        query_text: str,
        domain: str = None,
        limit: int = 10,
        anchoring: Optional[str] = None,
    ) -> QueryCollectiveResponse:
        """
        Query the collective for relevant heuristics per LLD §2.5
        Cost: $0.01 + royalties (automatic 402 payment)
        """
        self._validate_query_request(query_text, limit)

        request_body = {
            "queryText": query_text,
            "domain": domain,
            "limit": limit,
        }
        if anchoring == "immediate":
            request_body["anchoring"] = "immediate"

        response = await self.client.request_with_payment(
            "POST",
            "/v1/collective/query",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Collective query failed")

        data = response.data
        matches = [
            HeuristicMatch(**match) for match in data["matches"]
        ]

        return QueryCollectiveResponse(
            matches=matches,
            total_cost=data["totalCost"],
            royalties_usd=data["royaltiesUSD"],
            receipt_id=data["receiptId"],
            anchoring_tier=data.get("anchoringTier"),
            anchoring_status=data.get("anchoringStatus"),
            estimated_anchor_time=data.get("estimatedAnchorTime"),
        )

    def _validate_contribute_request(
        self,
        pattern: str,
        pattern_hash: str,
        domain: str,
        tags: List[str],
        metrics: HeuristicMetrics,
        encrypted_content_ref: str,
    ):
        """Validate contribution request"""
        # Validate pattern
        if not pattern or len(pattern) < 10:
            raise ValueError("pattern must be at least 10 characters")
        if len(pattern) > 500:
            raise ValueError("pattern must be at most 500 characters")

        # Validate patternHash (required per LLD §2.4)
        if not pattern_hash or not isinstance(pattern_hash, str):
            raise ValueError("pattern_hash is required and must be a string")

        # Validate domain
        if not domain:
            raise ValueError("domain is required")

        # Validate tags
        if not tags or len(tags) == 0:
            raise ValueError("tags must be a non-empty list")
        if len(tags) > 10:
            raise ValueError("tags must have at most 10 items")

        # Validate metrics (required per LLD §2.4)
        if not metrics or not isinstance(metrics, HeuristicMetrics):
            raise ValueError("metrics is required and must be a HeuristicMetrics instance")

        if not isinstance(metrics.success_rate, (int, float)):
            raise ValueError("metrics.success_rate must be a number")
        if metrics.success_rate < 0 or metrics.success_rate > 1:
            raise ValueError("metrics.success_rate must be between 0 and 1")

        if not isinstance(metrics.sample_size, int) or metrics.sample_size < 1:
            raise ValueError("metrics.sample_size must be a positive integer")

        if not isinstance(metrics.confidence, (int, float)):
            raise ValueError("metrics.confidence must be a number")
        if metrics.confidence < 0 or metrics.confidence > 1:
            raise ValueError("metrics.confidence must be between 0 and 1")

        # Validate encryptedContentRef (required per LLD §2.4)
        if not encrypted_content_ref or not isinstance(encrypted_content_ref, str):
            raise ValueError("encrypted_content_ref is required and must be a string")

    def _validate_query_request(self, query_text: str, limit: int):
        """Validate query request"""
        if not query_text or len(query_text) < 5:
            raise ValueError("query_text must be at least 5 characters")
        if len(query_text) > 500:
            raise ValueError("query_text must be at most 500 characters")
        if limit < 1 or limit > 50:
            raise ValueError("limit must be between 1 and 50")
