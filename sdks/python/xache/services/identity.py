"""Identity Service - Agent registration and ownership per LLD §2.2"""

import re
from typing import Optional, Dict, Any, List
from ..types import (
    RegisterIdentityResponse,
    SubmitClaimRequest,
    SubmitClaimResponse,
    ProcessClaimRequest,
    ProcessClaimResponse,
    PendingClaim,
    PendingClaimByOwner,
    OnChainClaimRequest,
    OnChainClaimResponse,
)


class IdentityService:
    """Identity service for agent registration and ownership management"""

    def __init__(self, client):
        self.client = client

    async def register(
        self,
        wallet_address: str,
        key_type: str,
        chain: str,
        owner_did: Optional[str] = None,
    ) -> RegisterIdentityResponse:
        """
        Register a new agent identity per LLD §2.2

        Args:
            wallet_address: Wallet address
            key_type: Key type ('evm' or 'solana')
            chain: Chain ('base' or 'solana')
            owner_did: Optional owner DID for SDK Auto-Registration (Option A)

        Returns:
            RegisterIdentityResponse

        Example:
            ```python
            # Basic registration
            identity = await client.identity.register(
                wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                key_type="evm",
                chain="base",
            )
            print(f"DID: {identity.did}")

            # Option A: SDK Auto-Registration with owner
            identity_with_owner = await client.identity.register(
                wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                key_type="evm",
                chain="base",
                owner_did="did:owner:evm:0x123...",  # Agent automatically linked
            )
            ```
        """
        # Validate request
        self._validate_register_request(wallet_address, key_type, chain)

        # Build request body
        request_body: Dict[str, Any] = {
            "walletAddress": wallet_address,
            "keyType": key_type,
            "chain": chain,
        }

        # Add optional owner_did for Option A
        if owner_did:
            request_body["ownerDID"] = owner_did

        # Make API request (no authentication required for registration)
        response = await self.client.request(
            "POST",
            "/v1/identity/register",
            request_body,
            skip_auth=True,
        )

        if not response.success or not response.data:
            raise Exception("Identity registration failed")

        data = response.data
        return RegisterIdentityResponse(
            did=data["did"],
            wallet_address=data["walletAddress"],
            key_type=data["keyType"],
            chain=data["chain"],
            created_at=data["createdAt"],
        )

    async def get(self, did: str) -> Dict[str, Any]:
        """
        Get identity by DID.

        Args:
            did: DID to look up

        Returns:
            Identity data dict
        """
        if not did:
            raise ValueError("DID is required")

        response = await self.client.request("GET", f"/v1/identity/{did}")

        if not response.success or not response.data:
            raise Exception("Failed to get identity")

        return response.data

    async def update(
        self,
        did: str,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Update identity details.

        Args:
            did: DID to update
            name: New display name
            metadata: New metadata

        Returns:
            Updated identity data dict
        """
        if not did:
            raise ValueError("DID is required")
        if not name and not metadata:
            raise ValueError("At least one of name or metadata must be provided")

        body: Dict[str, Any] = {}
        if name:
            body["name"] = name
        if metadata:
            body["metadata"] = metadata

        response = await self.client.request("PUT", f"/v1/identity/{did}", body)

        if not response.success or not response.data:
            raise Exception("Failed to update identity")

        return response.data

    async def delete(self, did: str) -> Dict[str, Any]:
        """
        Delete an identity.

        Args:
            did: DID to delete

        Returns:
            Deletion confirmation dict
        """
        if not did:
            raise ValueError("DID is required")

        response = await self.client.request("DELETE", f"/v1/identity/{did}")

        if not response.success or not response.data:
            raise Exception("Failed to delete identity")

        return response.data

    async def submit_claim_request(
        self,
        agent_did: str,
        webhook_url: Optional[str] = None,
    ) -> SubmitClaimResponse:
        """
        Submit ownership claim request (Option B: Async Claim Approval)

        Args:
            agent_did: Agent DID to claim
            webhook_url: Optional webhook URL for claim notification

        Returns:
            SubmitClaimResponse

        Example:
            ```python
            # Submit a claim request for an agent
            claim = await client.identity.submit_claim_request(
                agent_did="did:agent:evm:0x...",
                webhook_url="https://my-app.com/webhooks/claim-notification",
            )

            print(f"Claim submitted: {claim.status}")  # 'pending'
            print(f"Claim ID: {claim.claim_id}")
            ```
        """
        if not agent_did:
            raise ValueError("agent_did is required")

        request_body: Dict[str, Any] = {"agentDID": agent_did}
        if webhook_url:
            request_body["webhookUrl"] = webhook_url

        response = await self.client.request(
            "POST",
            "/v1/ownership/claim-request",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Failed to submit claim request")

        data = response.data
        return SubmitClaimResponse(
            claim_id=data["claimId"],
            status=data["status"],
            message=data["message"],
        )

    async def process_claim_request(
        self,
        owner_did: str,
        approved: bool,
        owner_signature: Optional[str] = None,
        agent_signature: Optional[str] = None,
        message: Optional[str] = None,
        timestamp: Optional[int] = None,
        rejection_reason: Optional[str] = None,
    ) -> ProcessClaimResponse:
        """
        Process ownership claim (approve/reject) (Option B: Async Claim Approval)

        Args:
            owner_did: Owner DID
            approved: Whether to approve the claim
            owner_signature: Owner signature (required if approved)
            agent_signature: Agent signature (required if approved)
            message: Optional message
            timestamp: Optional timestamp
            rejection_reason: Rejection reason (if not approved)

        Returns:
            ProcessClaimResponse

        Example:
            ```python
            # Agent approves a claim
            result = await agent_client.identity.process_claim_request(
                owner_did="did:owner:evm:0x...",
                approved=True,
                owner_signature="0x...",
                agent_signature="0x...",
                message="Ownership claim approval",
                timestamp=int(time.time() * 1000),
            )

            print(f"Claim status: {result.status}")  # 'approved'

            # Agent rejects a claim
            rejected = await agent_client.identity.process_claim_request(
                owner_did="did:owner:evm:0x...",
                approved=False,
                rejection_reason="Invalid claim",
            )

            print(f"Claim status: {rejected.status}")  # 'rejected'
            ```
        """
        if not owner_did:
            raise ValueError("owner_did is required")

        if not isinstance(approved, bool):
            raise ValueError("approved field is required")

        if approved and (not owner_signature or not agent_signature):
            raise ValueError("Signatures are required when approving a claim")

        request_body: Dict[str, Any] = {
            "ownerDID": owner_did,
            "approved": approved,
        }

        if owner_signature:
            request_body["ownerSignature"] = owner_signature
        if agent_signature:
            request_body["agentSignature"] = agent_signature
        if message:
            request_body["message"] = message
        if timestamp:
            request_body["timestamp"] = timestamp
        if rejection_reason:
            request_body["rejectionReason"] = rejection_reason

        response = await self.client.request(
            "POST",
            "/v1/ownership/claim-process",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Failed to process claim request")

        data = response.data
        return ProcessClaimResponse(
            status=data["status"],
            message=data["message"],
        )

    async def get_pending_claims_for_agent(self) -> Dict[str, Any]:
        """
        Get pending claims for the authenticated agent (Option B: Async Claim Approval)

        Returns:
            Dictionary with 'claims' list and 'count'

        Example:
            ```python
            # Agent checks pending claims
            pending_claims = await agent_client.identity.get_pending_claims_for_agent()

            print(f"You have {pending_claims['count']} pending claim(s)")

            for claim in pending_claims['claims']:
                print(f"Owner: {claim.owner_did}")
                print(f"Requested at: {claim.requested_at}")
                print(f"Webhook: {claim.webhook_url or 'None'}")
            ```
        """
        agent_did = self.client.did

        response = await self.client.request(
            "GET",
            f"/v1/ownership/pending-claims/{agent_did}",
        )

        if not response.success or not response.data:
            raise Exception("Failed to get pending claims")

        data = response.data
        claims_list = [
            PendingClaim(
                claim_id=claim["claimId"],
                owner_did=claim["ownerDID"],
                owner_wallet=claim["ownerWallet"],
                requested_at=claim["requestedAt"],
                webhook_url=claim.get("webhookUrl"),
            )
            for claim in data.get("claims", [])
        ]

        return {"claims": claims_list, "count": data.get("count", 0)}

    async def get_pending_claims_by_owner(self) -> Dict[str, Any]:
        """
        Get pending claims by the authenticated owner (Option B: Async Claim Approval)

        Returns:
            Dictionary with 'claims' list and 'count'

        Example:
            ```python
            # Owner checks their submitted claims
            my_claims = await owner_client.identity.get_pending_claims_by_owner()

            print(f"You have submitted {my_claims['count']} claim(s)")

            for claim in my_claims['claims']:
                print(f"Agent: {claim.agent_did}")
                print(f"Status: {claim.status}")
                print(f"Requested at: {claim.requested_at}")
            ```
        """
        owner_did = self.client.did

        response = await self.client.request(
            "GET",
            f"/v1/ownership/pending-claims/owner/{owner_did}",
        )

        if not response.success or not response.data:
            raise Exception("Failed to get pending claims")

        data = response.data
        claims_list = [
            PendingClaimByOwner(
                agent_did=claim["agentDID"],
                agent_wallet=claim["agentWallet"],
                requested_at=claim["requestedAt"],
                status=claim["status"],
            )
            for claim in data.get("claims", [])
        ]

        return {"claims": claims_list, "count": data.get("count", 0)}

    async def claim_on_chain(
        self,
        agent_did: str,
        tx_hash: str,
        chain: str,
    ) -> OnChainClaimResponse:
        """
        Claim agent ownership via on-chain transaction (Option C: On-chain Claiming)

        Args:
            agent_did: Agent DID to claim
            tx_hash: Transaction hash (Solana signature or EVM tx hash)
            chain: Chain ('solana' or 'base')

        Returns:
            OnChainClaimResponse

        Example:
            ```python
            # Claim ownership by providing a Solana transaction hash
            result = await owner_client.identity.claim_on_chain(
                agent_did="did:agent:sol:...",
                tx_hash="5wHu7...",  # Solana transaction signature
                chain="solana",
            )

            print("Ownership claimed via on-chain transaction")
            print(f"Status: {result.status}")  # 'approved'
            print(f"Transaction: {result.tx_hash}")
            print(f"Method: {result.method}")  # 'onchain-solana'

            # Claim ownership by providing a Base (EVM) transaction hash
            evm_result = await owner_client.identity.claim_on_chain(
                agent_did="did:agent:evm:0x...",
                tx_hash="0xabc123...",  # EVM transaction hash
                chain="base",
            )

            print("Ownership claimed via Base transaction")
            print(f"Status: {evm_result.status}")  # 'approved'
            ```
        """
        if not agent_did:
            raise ValueError("agent_did is required")

        if not tx_hash:
            raise ValueError("tx_hash is required")

        if chain not in ["solana", "base"]:
            raise ValueError('chain must be "solana" or "base"')

        request_body = {
            "agentDID": agent_did,
            "txHash": tx_hash,
            "chain": chain,
        }

        response = await self.client.request(
            "POST",
            "/v1/ownership/claim-onchain",
            request_body,
        )

        if not response.success or not response.data:
            raise Exception("Failed to claim ownership on-chain")

        data = response.data
        return OnChainClaimResponse(
            status=data["status"],
            tx_hash=data["txHash"],
            method=data["method"],
            message=data["message"],
        )

    def _validate_register_request(
        self, wallet_address: str, key_type: str, chain: str
    ) -> None:
        """Validate registration request"""
        if not wallet_address:
            raise ValueError("wallet_address is required")

        if key_type not in ["evm", "solana"]:
            raise ValueError('key_type must be "evm" or "solana"')

        if chain not in ["base", "solana"]:
            raise ValueError('chain must be "base" or "solana"')

        # Validate wallet address format
        if key_type == "evm":
            if not re.match(r"^0x[a-fA-F0-9]{40}$", wallet_address):
                raise ValueError("Invalid EVM wallet address format")
        else:
            if not re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", wallet_address):
                raise ValueError("Invalid Solana wallet address format")
