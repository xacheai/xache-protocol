"""Receipts Service - Access receipts and Merkle proofs"""

from typing import List, Dict, Any, Optional
from ..types import Receipt, ReceiptWithProof, UsageAnalytics


class ReceiptsService:
    """Receipt service for transaction records"""

    def __init__(self, client):
        self.client = client

    async def list(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List receipts for authenticated agent (free)

        Example:
            ```python
            result = await client.receipts.list(limit=20, offset=0)
            for receipt in result["receipts"]:
                print(f"{receipt.operation}: ${receipt.amount_usd}")
            ```
        """
        self._validate_list_options(limit, offset)

        response = await self.client.request(
            "GET",
            f"/v1/receipts?limit={limit}&offset={offset}",
        )

        if not response.success or not response.data:
            raise Exception("Failed to list receipts")

        data = response.data
        receipts = [Receipt(**r) for r in data["receipts"]]

        return {
            "receipts": receipts,
            "total": data["total"],
            "limit": data["limit"],
            "offset": data["offset"],
        }

    async def get_proof(self, receipt_id: str) -> ReceiptWithProof:
        """Get Merkle proof for a receipt (free)"""
        if not receipt_id:
            raise ValueError("receipt_id is required")

        response = await self.client.request(
            "GET",
            f"/v1/receipts/{receipt_id}/proof",
        )

        if not response.success or not response.data:
            raise Exception("Failed to get receipt proof")

        data = response.data
        return ReceiptWithProof(
            receipt_id=data["receiptId"],
            merkle_proof=data["merkleProof"],
            merkle_root=data["merkleRoot"],
        )

    async def get_analytics(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> UsageAnalytics:
        """Get usage analytics (free)"""
        params = []
        if start_date:
            params.append(f"startDate={start_date}")
        if end_date:
            params.append(f"endDate={end_date}")

        query_string = "&".join(params)
        path = f"/v1/analytics/usage?{query_string}" if query_string else "/v1/analytics/usage"

        response = await self.client.request("GET", path)

        if not response.success or not response.data:
            raise Exception("Failed to get usage analytics")

        data = response.data
        return UsageAnalytics(
            operations=data["operations"],
            total_spent=data["totalSpent"],
            period=data["period"],
        )

    async def get_by_operation(
        self, operation: str, limit: int = 50
    ) -> List[Receipt]:
        """Get receipts for specific operation type"""
        result = await self.list(limit=100)
        return [r for r in result["receipts"] if r.operation == operation][:limit]

    def _validate_list_options(self, limit: int, offset: int):
        """Validate list options"""
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")
        if offset < 0:
            raise ValueError("offset must be non-negative")

    # ========== Merkle Anchors ==========

    async def list_anchors(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        List Merkle root anchors with chain status.
        Shows hourly batches of receipts anchored to blockchain.

        Args:
            from_date: Start date (ISO format, default: 24 hours ago)
            to_date: End date (ISO format, default: now)
            limit: Maximum anchors to return (default: 100)

        Returns:
            Anchor list with chain status

        Example:
            ```python
            result = await client.receipts.list_anchors(
                from_date="2024-01-01T00:00:00Z",
                to_date="2024-01-31T23:59:59Z",
                limit=50
            )

            for anchor in result['anchors']:
                print(f"{anchor['hour']}: {anchor['receipt_count']} receipts")
                if anchor['base']:
                    print(f"  Base TX: {anchor['base']['tx_hash']}")
                if anchor['solana']:
                    print(f"  Solana TX: {anchor['solana']['tx_hash']}")
                if anchor['dual_anchored']:
                    print("  ✓ Dual-anchored")
            ```
        """
        params = []
        if from_date:
            params.append(f"from={from_date}")
        if to_date:
            params.append(f"to={to_date}")
        params.append(f"limit={limit}")

        query_string = "&".join(params)
        path = f"/v1/anchors?{query_string}"

        response = await self.client.request("GET", path, skip_auth=True)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to list anchors")
                if response.error
                else "Failed to list anchors"
            )

        data = response.data
        return {
            "anchors": [
                {
                    "hour": a["hour"],
                    "merkle_root": a["merkleRoot"],
                    "receipt_count": a["receiptCount"],
                    "base": (
                        {
                            "tx_hash": a["base"]["txHash"],
                            "gas_used": a["base"].get("gasUsed"),
                            "status": a["base"]["status"],
                            "anchored_at": a["base"].get("anchoredAt"),
                        }
                        if a.get("base")
                        else None
                    ),
                    "solana": (
                        {
                            "tx_hash": a["solana"]["txHash"],
                            "gas_used": a["solana"].get("gasUsed"),
                            "status": a["solana"]["status"],
                            "anchored_at": a["solana"].get("anchoredAt"),
                        }
                        if a.get("solana")
                        else None
                    ),
                    "dual_anchored": a.get("dualAnchored", False),
                }
                for a in data.get("anchors", [])
            ],
            "total": data.get("total", 0),
            "period": {
                "from": data["period"]["from"],
                "to": data["period"]["to"],
            },
        }
