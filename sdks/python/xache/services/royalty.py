"""
Royalty Service - Revenue tracking and earnings management
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from ..types import DID


@dataclass
class HeuristicRevenue:
    """Revenue for a single heuristic"""
    heuristic_id: str
    pattern: str
    domain: str
    earned_usd: str
    usage_count: int


@dataclass
class MonthlyEarning:
    """Monthly earnings"""
    month: str
    earned_usd: str


@dataclass
class RevenueStats:
    """Revenue statistics for an agent"""
    agent_did: DID
    total_earned_usd: str
    heuristic_count: int
    top_heuristics: List[HeuristicRevenue]
    earnings_by_domain: Dict[str, str]
    monthly_earnings: List[MonthlyEarning]


@dataclass
class PendingPayout:
    """Pending payout information"""
    heuristic_id: str
    heuristic_key: str
    pending_amount: str
    last_query_at: str
    query_count: int


@dataclass
class PlatformRevenue:
    """Platform-wide revenue statistics"""
    total_revenue: str
    total_agents: int
    total_heuristics: int
    total_queries: int
    average_revenue_per_agent: str


@dataclass
class TopEarner:
    """Top earner information"""
    rank: int
    agent_did: DID
    total_earned_usd: str
    heuristic_count: int
    reputation_score: float


class RoyaltyService:
    """
    Royalty service for revenue tracking and earnings management

    Track royalties earned from heuristic contributions and pending payouts.
    """

    def __init__(self, client):
        self.client = client

    async def get_revenue_stats(self, agent_did: DID) -> RevenueStats:
        """
        Get revenue statistics for an agent

        Args:
            agent_did: Agent DID to get stats for

        Returns:
            Revenue statistics

        Example:
            ```python
            stats = await client.royalty.get_revenue_stats("did:agent:evm:0x1234...")

            print(f"Total earned: ${stats.total_earned_usd}")
            print(f"Heuristics: {stats.heuristic_count}")

            for h in stats.top_heuristics:
                print(f"  {h.domain}: ${h.earned_usd} ({h.usage_count} uses)")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "GET", f"/v1/royalty/revenue/{quote(agent_did, safe='')}"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get revenue stats")
                if response.error
                else "Failed to get revenue stats"
            )

        data = response.data
        return RevenueStats(
            agent_did=data["agentDID"],
            total_earned_usd=data["totalEarnedUSD"],
            heuristic_count=data["heuristicCount"],
            top_heuristics=[
                HeuristicRevenue(
                    heuristic_id=h["heuristicId"],
                    pattern=h["pattern"],
                    domain=h["domain"],
                    earned_usd=h["earnedUSD"],
                    usage_count=h["usageCount"],
                )
                for h in data.get("topHeuristics", [])
            ],
            earnings_by_domain=data.get("earningsByDomain", {}),
            monthly_earnings=[
                MonthlyEarning(month=m["month"], earned_usd=m["earnedUSD"])
                for m in data.get("monthlyEarnings", [])
            ],
        )

    async def get_pending_payouts(self, agent_did: DID) -> Dict:
        """
        Get pending payouts for an agent

        Args:
            agent_did: Agent DID

        Returns:
            Pending payouts with total amount

        Example:
            ```python
            result = await client.royalty.get_pending_payouts("did:agent:evm:0x1234...")

            print(f"Total pending: ${result['total_pending_amount']}")
            for p in result['pending_payouts']:
                print(f"  {p.heuristic_key}: ${p.pending_amount}")
            ```
        """
        from urllib.parse import quote

        response = await self.client.request(
            "GET", f"/v1/royalty/payouts/{quote(agent_did, safe='')}"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get pending payouts")
                if response.error
                else "Failed to get pending payouts"
            )

        data = response.data
        return {
            "agent_did": data["agentDID"],
            "pending_payouts": [
                PendingPayout(
                    heuristic_id=p["heuristicId"],
                    heuristic_key=p["heuristicKey"],
                    pending_amount=p["pendingAmount"],
                    last_query_at=p["lastQueryAt"],
                    query_count=p["queryCount"],
                )
                for p in data.get("pendingPayouts", [])
            ],
            "total_pending_count": data.get("totalPendingCount", 0),
            "total_pending_amount": data.get("totalPendingAmount", "0"),
        }

    async def get_platform_revenue(self) -> PlatformRevenue:
        """
        Get platform-wide revenue statistics

        Returns:
            Platform revenue statistics

        Example:
            ```python
            platform = await client.royalty.get_platform_revenue()

            print(f"Platform revenue: ${platform.total_revenue}")
            print(f"Active agents: {platform.total_agents}")
            print(f"Total heuristics: {platform.total_heuristics}")
            ```
        """
        response = await self.client.request("GET", "/v1/royalty/platform")

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get platform revenue")
                if response.error
                else "Failed to get platform revenue"
            )

        data = response.data
        return PlatformRevenue(
            total_revenue=data["totalRevenue"],
            total_agents=data["totalAgents"],
            total_heuristics=data["totalHeuristics"],
            total_queries=data["totalQueries"],
            average_revenue_per_agent=data["averageRevenuePerAgent"],
        )

    async def get_top_earners(self, limit: int = 20) -> Dict:
        """
        Get top earning agents

        Args:
            limit: Number of top earners to return (default: 20)

        Returns:
            List of top earners

        Example:
            ```python
            result = await client.royalty.get_top_earners(10)

            for earner in result['top_earners']:
                print(f"#{earner.rank} {earner.agent_did}")
                print(f"   Earned: ${earner.total_earned_usd}")
            ```
        """
        response = await self.client.request(
            "GET", f"/v1/royalty/top-earners?limit={limit}"
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get top earners")
                if response.error
                else "Failed to get top earners"
            )

        data = response.data
        return {
            "top_earners": [
                TopEarner(
                    rank=e["rank"],
                    agent_did=e["agentDID"],
                    total_earned_usd=e["totalEarnedUSD"],
                    heuristic_count=e["heuristicCount"],
                    reputation_score=e["reputationScore"],
                )
                for e in data.get("topEarners", [])
            ],
            "total": data.get("total", 0),
        }

    async def get_my_revenue(self) -> RevenueStats:
        """
        Get revenue stats for the current authenticated agent

        Returns:
            Revenue statistics for authenticated agent

        Example:
            ```python
            my_stats = await client.royalty.get_my_revenue()
            print(f"My earnings: ${my_stats.total_earned_usd}")
            ```
        """
        return await self.get_revenue_stats(self.client.did)

    async def get_my_pending_payouts(self) -> Dict:
        """
        Get pending payouts for the current authenticated agent

        Returns:
            Pending payouts for authenticated agent

        Example:
            ```python
            result = await client.royalty.get_my_pending_payouts()
            print(f"Pending: ${result['total_pending_amount']}")
            ```
        """
        return await self.get_pending_payouts(self.client.did)
