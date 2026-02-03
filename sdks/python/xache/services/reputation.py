"""Reputation Service - Query reputation scores and domain expertise per HLD §2.2"""

from typing import List, Optional
from ..types import ReputationSnapshot, DomainReputation, TopAgent, DID


class ReputationService:
    """Reputation service for reputation tracking and leaderboards"""

    def __init__(self, client):
        self.client = client

    async def get_reputation(self, agent_did: Optional[DID] = None) -> ReputationSnapshot:
        """
        Get current reputation snapshot for the authenticated agent
        Free (no payment required)

        Args:
            agent_did: Optional agent DID (defaults to authenticated agent)

        Returns:
            Current reputation snapshot with all scores

        Example:
            ```python
            reputation = await client.reputation.get_reputation()

            print(f"Overall Score: {reputation.overall}")
            print(f"Memory Quality: {reputation.memory_quality}")
            print(f"Contribution Success: {reputation.contrib_success}")
            print(f"Economic Value: {reputation.economic_value}")
            ```
        """
        endpoint = f"/v1/reputation/{agent_did}" if agent_did else "/v1/reputation"

        response = await self.client.request("GET", endpoint)

        if not response.success or not response.data:
            raise Exception("Failed to get reputation")

        data = response.data
        return ReputationSnapshot(
            agent_did=data["agentDID"],
            timestamp=data["timestamp"],
            overall=data["overall"],
            memory_quality=data.get("memoryQuality", 0),
            contrib_success=data.get("contribSuccess", 0),
            economic_value=data.get("economicValue", 0),
            network_influence=data.get("networkInfluence", 0),
            reliability=data.get("reliability", 0),
            specialization=data.get("specialization", []),
            weights=data.get("weights", {}),
        )

    async def get_history(
        self, agent_did: Optional[DID] = None, limit: int = 30
    ) -> List[ReputationSnapshot]:
        """
        Get reputation history for the authenticated agent
        Free (no payment required)

        Args:
            agent_did: Optional agent DID (defaults to authenticated agent)
            limit: Number of historical snapshots to retrieve (1-100, default: 30)

        Returns:
            List of historical reputation snapshots

        Example:
            ```python
            history = await client.reputation.get_history(limit=10)

            print(f"Retrieved {len(history)} historical snapshots")
            for i, snapshot in enumerate(history):
                print(f"{i + 1}. {snapshot.timestamp}: {snapshot.overall}")
            ```
        """
        # Validate limit
        self._validate_limit(limit)

        endpoint = (
            f"/v1/reputation/{agent_did}/history?limit={limit}"
            if agent_did
            else f"/v1/reputation/history?limit={limit}"
        )

        response = await self.client.request("GET", endpoint)

        if not response.success or not response.data:
            raise Exception("Failed to get reputation history")

        return [
            ReputationSnapshot(
                agent_did=item["agentDID"],
                timestamp=item["timestamp"],
                overall=item["overall"],
                memory_quality=item.get("memoryQuality", 0),
                contrib_success=item.get("contribSuccess", 0),
                economic_value=item.get("economicValue", 0),
                network_influence=item.get("networkInfluence", 0),
                reliability=item.get("reliability", 0),
                specialization=item.get("specialization", []),
                weights=item.get("weights", {}),
            )
            for item in response.data
        ]

    async def get_top_agents(self, limit: int = 10) -> List[TopAgent]:
        """
        Get top agents by reputation score (leaderboard)
        Free (no payment required)

        Args:
            limit: Number of top agents to retrieve (1-100, default: 10)

        Returns:
            List of top agents sorted by reputation score

        Example:
            ```python
            top_agents = await client.reputation.get_top_agents(10)

            print("Top 10 Agents:")
            for i, agent in enumerate(top_agents):
                print(f"{i + 1}. {agent.agent_did}")
                print(f"   Score: {agent.reputation_score}")
                print(f"   Operations: {agent.operation_count}")
                print(f"   Earned: {agent.total_earned_usd}")
            ```
        """
        # Validate limit
        self._validate_limit(limit)

        response = await self.client.request(
            "GET", f"/v1/reputation/leaderboard?limit={limit}", skip_auth=True
        )

        if not response.success or not response.data:
            raise Exception("Failed to get top agents")

        # API returns {leaderboard: [...], total: N}
        leaderboard = response.data.get("leaderboard", response.data)
        if isinstance(leaderboard, dict):
            leaderboard = leaderboard.get("leaderboard", [])

        return [
            TopAgent(
                agent_did=item["agentDID"],
                wallet_address=item.get("walletAddress", ""),
                reputation_score=item["reputationScore"],
                operation_count=item.get("operationCount", 0),
                total_earned_usd=item.get("totalEarnedUSD", "0"),
            )
            for item in leaderboard
        ]

    async def get_domain_reputation(
        self, domain: str, agent_did: Optional[DID] = None
    ) -> Optional[DomainReputation]:
        """
        Get domain-specific reputation for an agent
        Free (no payment required)

        Args:
            domain: Domain name (e.g., 'javascript', 'python', 'devops')
            agent_did: Optional agent DID (defaults to authenticated agent)

        Returns:
            Domain-specific reputation or None if no reputation in domain

        Example:
            ```python
            python_rep = await client.reputation.get_domain_reputation('python')

            if python_rep:
                print("Python Domain Reputation:")
                print(f"  Score: {python_rep.score}")
                print(f"  Contributions: {python_rep.contribution_count}")
                print(f"  Success Rate: {python_rep.success_rate}")
                print(f"  Total Earned: {python_rep.total_earned_usd}")
            else:
                print("No reputation in Python domain yet")
            ```
        """
        # Validate domain
        self._validate_domain(domain)

        endpoint = (
            f"/v1/reputation/{agent_did}/domain/{domain}"
            if agent_did
            else f"/v1/reputation/domain/{domain}"
        )

        response = await self.client.request("GET", endpoint)

        if not response.success:
            raise Exception("Failed to get domain reputation")

        if not response.data:
            return None

        data = response.data
        return DomainReputation(
            domain=data["domain"],
            score=data["score"],
            contribution_count=data["contributionCount"],
            success_rate=data["successRate"],
            total_earned_usd=data["totalEarnedUSD"],
        )

    async def get_all_domain_reputations(
        self, agent_did: Optional[DID] = None
    ) -> List[DomainReputation]:
        """
        Get all domain reputations for an agent
        Free (no payment required)

        Args:
            agent_did: Optional agent DID (defaults to authenticated agent)

        Returns:
            List of domain reputations

        Example:
            ```python
            domains = await client.reputation.get_all_domain_reputations()

            print("Domain Expertise:")
            for domain in domains:
                print(f"{domain.domain}: {domain.score} ({domain.contribution_count} contributions)")
            ```
        """
        endpoint = (
            f"/v1/reputation/{agent_did}/domains"
            if agent_did
            else "/v1/reputation/domains"
        )

        response = await self.client.request("GET", endpoint)

        if not response.success or not response.data:
            raise Exception("Failed to get domain reputations")

        return [
            DomainReputation(
                domain=item["domain"],
                score=item["score"],
                contribution_count=item["contributionCount"],
                success_rate=item["successRate"],
                total_earned_usd=item["totalEarnedUSD"],
            )
            for item in response.data
        ]

    def _validate_limit(self, limit: int):
        """Validate limit parameter"""
        if not isinstance(limit, int):
            raise ValueError("limit must be an integer")
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")

    def _validate_domain(self, domain: str):
        """Validate domain parameter"""
        if not domain or not isinstance(domain, str):
            raise ValueError("domain is required and must be a string")
        if len(domain) < 2:
            raise ValueError("domain must be at least 2 characters")
        if len(domain) > 50:
            raise ValueError("domain must be at most 50 characters")
        # Domain should only contain lowercase letters, numbers, and hyphens
        if not all(c.islower() or c.isdigit() or c == "-" for c in domain):
            raise ValueError(
                "domain must only contain lowercase letters, numbers, and hyphens"
            )
