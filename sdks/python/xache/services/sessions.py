"""
Session Service - x402 v2 wallet session management
"""

from typing import Any, Dict, Optional, List
from dataclasses import dataclass


@dataclass
class WalletSession:
    """Wallet session for pre-authorized payments"""
    session_id: str
    wallet_address: str
    chain: str
    network: str
    created_at: int  # Unix ms timestamp
    expires_at: int  # Unix ms timestamp
    max_amount: str
    amount_spent: str
    scope: List[str]
    agent_did: Optional[str] = None


@dataclass
class SessionValidation:
    """Session validation result"""
    valid: bool
    session_id: str
    has_budget: bool
    remaining_amount: str
    reason: Optional[str] = None


@dataclass
class CreateSessionOptions:
    """Options for creating a session"""
    wallet_address: str
    chain: str
    network: str
    signed_message: str
    signature: str
    duration_seconds: int = 3600  # 1 hour default
    max_amount: Optional[str] = None
    scope: Optional[List[str]] = None


class SessionService:
    """
    Session service for x402 v2 wallet session management

    Sessions allow pre-authorized payments within a budget and time limit,
    reducing the need for per-request wallet signatures.
    """

    def __init__(self, client):
        self.client = client

    async def create(self, options: CreateSessionOptions) -> WalletSession:
        """
        Create a new wallet session for pre-authorized payments

        Args:
            options: Session creation options

        Returns:
            Created wallet session

        Example:
            ```python
            from xache.services.sessions import CreateSessionOptions

            session = await client.sessions.create(CreateSessionOptions(
                wallet_address="0x1234...",
                chain="evm",
                network="base-sepolia",
                signed_message=signed_siwe,
                signature=wallet_sig,
                duration_seconds=3600,  # 1 hour
                max_amount="10000000",  # 10 USDC
                scope=["memory:store", "memory:retrieve"]
            ))

            print(f"Session ID: {session.session_id}")
            print(f"Expires: {session.expires_at}")
            ```
        """
        body = {
            "walletAddress": options.wallet_address,
            "chain": options.chain,
            "network": options.network,
            "durationSeconds": options.duration_seconds,
            "signedMessage": options.signed_message,
            "signature": options.signature,
        }

        if options.max_amount:
            body["maxAmount"] = options.max_amount
        if options.scope:
            body["scope"] = options.scope

        response = await self.client.request("POST", "/v1/sessions", body)

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to create session")
                if response.error
                else "Failed to create session"
            )

        return self._parse_session(response.data.get("session", response.data))

    async def get(self, session_id: str, wallet_address: str) -> Optional[WalletSession]:
        """
        Get session by ID

        Args:
            session_id: Session identifier
            wallet_address: Wallet address that owns the session (required for routing)

        Returns:
            Wallet session or None if not found

        Example:
            ```python
            session = await client.sessions.get("sess_abc123", "0x1234...")
            if session:
                print(f"Spent: {session.amount_spent}")
            ```
        """
        response = await self.client.request(
            "GET",
            f"/v1/sessions/{session_id}?wallet={wallet_address}",
        )

        if not response.success:
            if response.error and response.error.get("code") == "NOT_FOUND":
                return None
            raise Exception(
                response.error.get("message", "Failed to get session")
                if response.error
                else "Failed to get session"
            )

        if not response.data:
            return None

        return self._parse_session(response.data.get("session", response.data))

    async def validate(
        self,
        session_id: str,
        wallet_address: str,
        amount: str,
        scope: Optional[str] = None,
    ) -> SessionValidation:
        """
        Validate session for a specific operation

        Args:
            session_id: Session identifier
            wallet_address: Wallet address that owns the session (required for routing)
            amount: Amount to validate (in smallest unit, e.g., microcents)
            scope: Operation scope to validate (e.g., "memory:store")

        Returns:
            Validation result

        Example:
            ```python
            validation = await client.sessions.validate(
                "sess_abc123",
                "0x1234...",
                amount="1000",
                scope="memory:store"
            )

            if validation.valid and validation.has_budget:
                print("Session is valid for this operation")
            else:
                print(f"Invalid: {validation.reason}")
            ```
        """
        body: Dict[str, Any] = {"amount": amount}
        if scope:
            body["scope"] = scope

        response = await self.client.request(
            "POST",
            f"/v1/sessions/{session_id}/validate?wallet={wallet_address}",
            body,
        )

        if not response.success or not response.data:
            raise Exception(
                response.error.get("message", "Failed to validate session")
                if response.error
                else "Failed to validate session"
            )

        data = response.data
        return SessionValidation(
            valid=data.get("valid", False),
            session_id=data.get("sessionId", session_id),
            has_budget=data.get("hasBudget", False),
            remaining_amount=data.get("remainingAmount", "0"),
            reason=data.get("reason"),
        )

    async def revoke(self, session_id: str, wallet_address: str) -> bool:
        """
        Revoke a session

        Args:
            session_id: Session identifier
            wallet_address: Wallet address that owns the session (required for routing)

        Returns:
            True if successfully revoked

        Example:
            ```python
            revoked = await client.sessions.revoke("sess_abc123", "0x1234...")
            if revoked:
                print("Session revoked successfully")
            ```
        """
        response = await self.client.request(
            "DELETE",
            f"/v1/sessions/{session_id}?wallet={wallet_address}",
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to revoke session")
                if response.error
                else "Failed to revoke session"
            )

        return True

    async def list_by_wallet(self, wallet_address: str) -> List[WalletSession]:
        """
        List sessions for a specific wallet address.

        Args:
            wallet_address: Wallet address to filter by

        Returns:
            List of wallet sessions

        Example:
            ```python
            sessions = await client.sessions.list_by_wallet("0x1234...")
            print(f"Active sessions: {len(sessions)}")
            for s in sessions:
                print(f"  {s.session_id}: expires {s.expires_at}")
            ```
        """
        response = await self.client.request(
            "GET",
            f"/v1/sessions/wallet/{wallet_address}",
        )

        if not response.success:
            raise Exception(
                response.error.get("message", "Failed to list sessions")
                if response.error
                else "Failed to list sessions"
            )

        sessions_data = (response.data or {}).get("sessions", [])
        return [self._parse_session(s) for s in sessions_data]

    async def create_and_activate(self, options: CreateSessionOptions) -> WalletSession:
        """
        Create a session and set it as the current session.

        Args:
            options: Session creation options

        Returns:
            Created and activated wallet session
        """
        session = await self.create(options)
        return session

    def _parse_session(self, data: dict) -> WalletSession:
        """Parse session data into WalletSession object"""
        return WalletSession(
            session_id=data["sessionId"],
            wallet_address=data["walletAddress"],
            chain=data["chain"],
            network=data["network"],
            created_at=data["createdAt"],
            expires_at=data["expiresAt"],
            max_amount=data.get("maxAmount", "0"),
            amount_spent=data.get("amountSpent", "0"),
            scope=data.get("scope", []),
            agent_did=data.get("agentDID"),
        )
