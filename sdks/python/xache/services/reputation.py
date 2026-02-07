"""Reputation Service - Query reputation scores and domain expertise per HLD §2.2"""

from typing import Any, Dict, List, Optional, Literal
from ..types import (
    ReputationSnapshot,
    DomainReputation,
    TopAgent,
    DID,
    ERC8004FeedbackAuth,
    ERC8004TypedData,
    ERC8004TypedDataDomain,
    ERC8004EnableResponse,
    ERC8004ExportStatus,
)

ERC8004Network = Literal["base", "base-sepolia"]


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

    def _validate_limit(self, limit: int) -> None:
        """Validate limit parameter"""
        if not isinstance(limit, int):
            raise ValueError("limit must be an integer")
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")

    def _validate_domain(self, domain: str) -> None:
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

    # ===========================================================================
    # ERC-8004 Portable Reputation (https://www.8004.org/)
    # ===========================================================================

    async def build_erc8004_authorization(
        self,
        wallet_address: str,
        expiry_days: int = 365,
        index_limit: int = 100,
        network: ERC8004Network = "base-sepolia",
    ) -> Dict[str, Any]:
        """
        Build ERC-8004 authorization for external signing.

        Fetches the EIP-712 typed data structure from the backend (which has the
        correct contract addresses). Use the returned typed data with eth_account,
        web3.py, or any EIP-712 compatible signer.

        Args:
            wallet_address: Your wallet address that will sign the authorization
            expiry_days: Number of days until authorization expires (default: 365)
            index_limit: Maximum number of feedback entries allowed (default: 100)
            network: Network: 'base' or 'base-sepolia' (default: 'base-sepolia')

        Returns:
            Dict with 'typed_data' (ERC8004TypedData) and 'authorization' (ERC8004FeedbackAuth)

        Example:
            ```python
            # Step 1: Build the typed data (fetches from backend)
            result = await client.reputation.build_erc8004_authorization(
                wallet_address='0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
                expiry_days=365,
                index_limit=100,
            )
            typed_data = result['typed_data']
            authorization = result['authorization']

            # Step 2: Sign with your wallet (eth_account example)
            from eth_account import Account
            from eth_account.messages import encode_typed_data

            message = encode_typed_data(full_message=typed_data)
            signed = Account.sign_message(message, private_key=your_key)
            signature = signed.signature.hex()

            # Step 3: Submit the signature
            await client.reputation.submit_erc8004_authorization(
                authorization=authorization,
                signature=signature,
                network='base-sepolia',
            )
            ```
        """
        if not wallet_address:
            raise ValueError("wallet_address is required")

        # Build query params
        params = f"wallet={wallet_address}&network={network}"
        if expiry_days:
            params += f"&expiryDays={expiry_days}"
        if index_limit:
            params += f"&indexLimit={index_limit}"

        # Fetch typed data from backend (single source of truth for contract addresses)
        response = await self.client.request(
            "GET", f"/v1/reputation/erc8004/auth-request?{params}", skip_auth=True
        )

        if not response.success or not response.data:
            raise Exception("Failed to get ERC-8004 authorization data from backend")

        data = response.data
        typed_data_raw = data["typedData"]
        auth_raw = data["authorization"]

        # Convert to typed objects
        typed_data = ERC8004TypedData(
            domain=ERC8004TypedDataDomain(
                name=typed_data_raw["domain"]["name"],
                version=typed_data_raw["domain"]["version"],
                chain_id=typed_data_raw["domain"]["chainId"],
                verifying_contract=typed_data_raw["domain"]["verifyingContract"],
            ),
            types=typed_data_raw["types"],
            primary_type=typed_data_raw["primaryType"],
            message=typed_data_raw["message"],
        )

        authorization = ERC8004FeedbackAuth(
            agent_id=auth_raw["agentId"],
            client_address=auth_raw["clientAddress"],
            index_limit=auth_raw["indexLimit"],
            expiry=auth_raw["expiry"],
            chain_id=auth_raw["chainId"],
            identity_registry=auth_raw["identityRegistry"],
            signer_address=auth_raw["signerAddress"],
        )

        return {"typed_data": typed_data, "authorization": authorization}

    async def submit_erc8004_authorization(
        self,
        authorization: ERC8004FeedbackAuth,
        signature: str,
        network: ERC8004Network = "base-sepolia",
    ) -> ERC8004EnableResponse:
        """
        Submit a signed ERC-8004 authorization.

        After signing the typed data from build_erc8004_authorization(), submit
        the signature to enable reputation export.

        Args:
            authorization: The authorization struct from build_erc8004_authorization()
            signature: The EIP-712 signature from your wallet
            network: Network: 'base' or 'base-sepolia' (default: 'base-sepolia')

        Returns:
            Authorization confirmation with ID and expiry

        Example:
            ```python
            result = await client.reputation.submit_erc8004_authorization(
                authorization=authorization,
                signature='0x...',
                network='base-sepolia',
            )

            print('ERC-8004 export enabled!')
            print(f'Authorization ID: {result.authorization_id}')
            ```
        """
        if not authorization or not signature:
            raise ValueError("authorization and signature are required")

        # Convert authorization to dict for API
        auth_dict = {
            "agentId": authorization.agent_id,
            "clientAddress": authorization.client_address,
            "indexLimit": authorization.index_limit,
            "expiry": authorization.expiry,
            "chainId": authorization.chain_id,
            "identityRegistry": authorization.identity_registry,
            "signerAddress": authorization.signer_address,
        }

        response = await self.client.request(
            "POST",
            "/v1/reputation/erc8004/authorize",
            body={
                "authorization": auth_dict,
                "signature": signature,
                "network": network,
            },
        )

        if not response.success or not response.data:
            raise Exception("Failed to enable ERC-8004 export")

        data = response.data
        return ERC8004EnableResponse(
            authorization_id=data.get("authorizationId", ""),
            agent_id=data.get("agentId", ""),
            expires_at=data.get("expiresAt", ""),
            message=data.get("message", ""),
        )

    async def disable_erc8004_export(self) -> Dict[str, Any]:
        """
        Disable ERC-8004 reputation export.

        Revokes the current authorization, preventing further reputation exports.

        Returns:
            Dict with 'success' and 'message'

        Example:
            ```python
            await client.reputation.disable_erc8004_export()
            print('ERC-8004 export disabled')
            ```
        """
        response = await self.client.request(
            "DELETE", "/v1/reputation/erc8004/authorize"
        )

        if not response.success or not response.data:
            raise Exception("Failed to disable ERC-8004 export")

        return response.data

    async def get_erc8004_status(self) -> ERC8004ExportStatus:
        """
        Get ERC-8004 export status.

        Check if ERC-8004 export is enabled and view export history.

        Returns:
            ERC8004ExportStatus with enabled status and details

        Example:
            ```python
            status = await client.reputation.get_erc8004_status()

            if status.enabled:
                print('ERC-8004 export is enabled')
                print(f'Expires: {status.expires_at}')
                print(f'Feedbacks used: {status.feedbacks_used} / {status.feedbacks_limit}')
                if status.last_exported_at:
                    print(f'Last exported: {status.last_exported_at}')
                    print(f'Score: {status.last_exported_score}')
            else:
                print('ERC-8004 export is not enabled')
            ```
        """
        response = await self.client.request("GET", "/v1/reputation/erc8004/status")

        if not response.success or not response.data:
            raise Exception("Failed to get ERC-8004 status")

        data = response.data
        return ERC8004ExportStatus(
            enabled=data.get("enabled", False),
            is_valid=data.get("isValid", False),
            expires_at=data.get("expiresAt"),
            feedbacks_used=data.get("feedbacksUsed"),
            feedbacks_limit=data.get("feedbacksLimit"),
            erc8004_agent_id=data.get("erc8004AgentId"),
            last_exported_at=data.get("lastExportedAt"),
            last_exported_score=data.get("lastExportedScore"),
            network=data.get("network"),
        )
