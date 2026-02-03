"""
Owner Service - Owner identity registration and management
"""

from typing import List, Optional, Dict
from dataclasses import dataclass
from ..types import DID


@dataclass
class Owner:
    """Owner profile information"""
    owner_did: DID
    wallet_address: str
    wallet_chain: str  # 'evm' | 'solana'
    entity_type: str  # 'human' | 'organization'
    display_name: Optional[str]
    organization_name: Optional[str]
    email: Optional[str]
    email_verified: bool
    wallet_verified: bool
    created_at: str
    updated_at: str


@dataclass
class OwnedAgent:
    """Owned agent information"""
    agent_did: DID
    wallet_address: str
    chain: str
    claim_type: str  # 'individual' | 'workspace'
    workspace_id: Optional[str]
    workspace_name: Optional[str]
    role: Optional[str]  # 'admin' | 'member'
    added_at: str


class OwnerService:
    """
    Owner service for identity registration and management

    Register and manage owner identities for enterprise fleet management.
    """

    def __init__(self, client):
        self.client = client

    async def register(
        self,
        wallet_address: str,
        wallet_chain: str,
        entity_type: str,
        display_name: Optional[str] = None,
        organization_name: Optional[str] = None,
        email: Optional[str] = None,
        supabase_user_id: Optional[str] = None,
    ) -> Owner:
        """
        Register a new owner (human or organization)

        Args:
            wallet_address: Wallet address
            wallet_chain: Wallet chain ('evm' or 'solana')
            entity_type: Entity type ('human' or 'organization')
            display_name: Optional display name
            organization_name: Optional organization name
            email: Optional email address
            supabase_user_id: Optional Supabase user ID

        Returns:
            Registered owner

        Example:
            ```python
            owner = await client.owner.register(
                wallet_address="0x1234...",
                wallet_chain="evm",
                entity_type="human",
                display_name="John Doe",
                email="john@example.com"
            )
            print(f"Registered: {owner.owner_did}")
            ```
        """
        body = {
            "walletAddress": wallet_address,
            "walletChain": wallet_chain,
            "entityType": entity_type,
        }

        if display_name:
            body["displayName"] = display_name
        if organization_name:
            body["organizationName"] = organization_name
        if email:
            body["email"] = email
        if supabase_user_id:
            body["supabaseUserId"] = supabase_user_id

        response = await self.client.request(
            "POST", "/v1/owners/register", body, skip_auth=True
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to register owner")
                if response.error
                else "Failed to register owner"
            )

        return self._parse_owner(response.data.get("owner", response.data))

    async def verify_wallet(
        self,
        owner_did: DID,
        message: str,
        signature: str,
        timestamp: int,
    ) -> bool:
        """
        Verify wallet ownership with cryptographic signature

        Args:
            owner_did: Owner DID
            message: Message that was signed
            signature: Signature
            timestamp: Timestamp of signature

        Returns:
            True if verified

        Example:
            ```python
            verified = await client.owner.verify_wallet(
                owner_did="did:owner:evm:0x1234...",
                message="Verify wallet ownership",
                signature="0x...",
                timestamp=1699900000
            )
            print(f"Verified: {verified}")
            ```
        """
        body = {
            "ownerDID": owner_did,
            "message": message,
            "signature": signature,
            "timestamp": timestamp,
        }

        response = await self.client.request(
            "POST", "/v1/owners/verify-wallet", body, skip_auth=True
        )

        if not response.success or response.data is None:
            raise Exception(
                response.error.get("message", "Failed to verify wallet")
                if response.error
                else "Failed to verify wallet"
            )

        return response.data.get("verified", False)

    async def get_profile(self) -> Optional[Owner]:
        """
        Get the authenticated owner's profile

        Returns:
            Owner profile or None if not found

        Example:
            ```python
            profile = await client.owner.get_profile()
            if profile:
                print(f"Display name: {profile.display_name}")
            ```
        """
        response = await self.client.request("GET", "/v1/owners/me")

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to get profile")
                if response.error
                else "Failed to get profile"
            )

        if not response.data or not response.data.get("owner"):
            return None

        return self._parse_owner(response.data["owner"])

    async def update_profile(
        self,
        display_name: Optional[str] = None,
        organization_name: Optional[str] = None,
        email: Optional[str] = None,
    ) -> Owner:
        """
        Update the authenticated owner's profile

        Args:
            display_name: Optional new display name
            organization_name: Optional new organization name
            email: Optional new email

        Returns:
            Updated owner profile

        Example:
            ```python
            updated = await client.owner.update_profile(
                display_name="Jane Doe",
                organization_name="Acme Corp"
            )
            print(f"Updated: {updated.display_name}")
            ```
        """
        body = {}
        if display_name is not None:
            body["displayName"] = display_name
        if organization_name is not None:
            body["organizationName"] = organization_name
        if email is not None:
            body["email"] = email

        response = await self.client.request("PUT", "/v1/owners/me", body)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to update profile")
                if response.error
                else "Failed to update profile"
            )

        return self._parse_owner(response.data.get("owner", response.data))

    async def get_owned_agents(self) -> Dict:
        """
        Get all agents owned by the authenticated owner

        Returns:
            Dictionary with agents and count

        Example:
            ```python
            result = await client.owner.get_owned_agents()
            print(f"Total owned agents: {result['count']}")

            for agent in result['agents']:
                print(f"{agent.agent_did} - {agent.claim_type}")
            ```
        """
        response = await self.client.request("GET", "/v1/owners/me/agents")

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to get owned agents")
                if response.error
                else "Failed to get owned agents"
            )

        return {
            "agents": [
                OwnedAgent(
                    agent_did=a["agentDID"],
                    wallet_address=a["walletAddress"],
                    chain=a["chain"],
                    claim_type=a["claimType"],
                    workspace_id=a.get("workspaceId"),
                    workspace_name=a.get("workspaceName"),
                    role=a.get("role"),
                    added_at=a["addedAt"],
                )
                for a in response.data.get("agents", [])
            ],
            "count": response.data.get("count", 0),
        }

    def _parse_owner(self, data: dict) -> Owner:
        """Parse owner data into Owner object"""
        return Owner(
            owner_did=data["ownerDID"],
            wallet_address=data["walletAddress"],
            wallet_chain=data["walletChain"],
            entity_type=data["entityType"],
            display_name=data.get("displayName"),
            organization_name=data.get("organizationName"),
            email=data.get("email"),
            email_verified=data.get("emailVerified", False),
            wallet_verified=data.get("walletVerified", False),
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
        )
