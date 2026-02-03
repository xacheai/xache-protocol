"""
Xache Protocol Python SDK
Main client class
"""

import json
from typing import Dict, Optional, Any, Literal

from .types import XacheClientConfig, APIResponse
from .utils.http import HttpClient
from .crypto.signing import generate_auth_headers, validate_did
from .errors import PaymentRequiredError


class XacheClient:
    """
    Main Xache client with async support

    Example:
        ```python
        async with XacheClient(
            api_url="https://api.xache.xyz",
            did="did:agent:evm:0xYourWalletAddress",
            private_key="0x...",
        ) as client:
            # Register identity
            identity = await client.identity.register(
                wallet_address="0xYourWalletAddress",
                key_type="evm",
                chain="base",
            )
            print(f"DID: {identity.did}")
        ```
    """

    def __init__(
        self,
        api_url: str,
        did: str,
        private_key: str,
        payment_provider: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
        debug: bool = False,
    ):
        """
        Initialize Xache client

        Args:
            api_url: API Gateway URL
            did: Agent DID
            private_key: Private key for signing (hex string)
            payment_provider: Payment provider configuration
            timeout: Request timeout in seconds
            debug: Enable debug logging
        """
        # Validate configuration
        self._validate_config(api_url, did, private_key)

        # Store configuration
        self.api_url = api_url
        self.did = did
        self.private_key = private_key
        self.payment_provider = payment_provider
        self.timeout = timeout
        self.debug = debug

        # Initialize HTTP client
        self._http_client = HttpClient(timeout=timeout, debug=debug)

        # Initialize payment handler (lazy loading)
        self._payment_handler = None

        # Initialize services (lazy loading)
        self._identity_service = None
        self._memory_service = None
        self._collective_service = None
        self._budget_service = None
        self._receipts_service = None
        self._reputation_service = None
        self._extraction_service = None
        self._facilitator_service = None
        self._session_service = None
        self._royalty_service = None
        self._workspace_service = None
        self._owner_service = None

        if self.debug:
            print(f"Xache client initialized: api_url={api_url}, did={did}")

    async def __aenter__(self):
        """Async context manager entry"""
        await self._http_client.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self._http_client.__aexit__(exc_type, exc_val, exc_tb)

    def _validate_config(self, api_url: str, did: str, private_key: str):
        """Validate client configuration"""
        if not api_url:
            raise ValueError("api_url is required")

        if not did:
            raise ValueError("did is required")

        if not validate_did(did):
            raise ValueError(
                f"Invalid DID format: {did}. Expected: did:agent:<evm|sol>:<address>"
            )

        if not private_key:
            raise ValueError("private_key is required")

        # Validate private key format (hex string)
        clean_key = private_key[2:] if private_key.startswith("0x") else private_key
        if len(clean_key) != 64 or not all(c in "0123456789abcdefABCDEF" for c in clean_key):
            raise ValueError("private_key must be a 64-character hex string")

    async def request(
        self,
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"],
        path: str,
        body: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        skip_auth: bool = False,
    ) -> APIResponse:
        """
        Make authenticated API request

        Args:
            method: HTTP method
            path: API path
            body: Request body
            idempotency_key: Idempotency key for 402 payment
            skip_auth: Skip authentication headers

        Returns:
            API response
        """
        url = f"{self.api_url}{path}"
        body_str = json.dumps(body) if body else ""

        # Build headers
        headers: Dict[str, str] = {}

        # Add authentication headers (unless skipped)
        if not skip_auth:
            auth_headers = generate_auth_headers(
                method, path, body_str, self.did, self.private_key
            )
            headers.update(auth_headers)

        # Add idempotency key if provided
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        if self.debug:
            print(f"{method} {path}", {"body": body, "headers": headers})

        # Make request
        response = await self._http_client.request(
            method, url, headers, body_str or None
        )

        if self.debug:
            print(f"{method} {path} response:", response)

        return response

    async def request_with_payment(
        self,
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"],
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> APIResponse:
        """
        Make authenticated API request with automatic 402 payment handling

        Args:
            method: HTTP method
            path: API path
            body: Request body

        Returns:
            API response
        """
        try:
            # First attempt without idempotency key
            return await self.request(method, path, body)
        except PaymentRequiredError as e:
            if self.debug:
                print("402 Payment Required:", e)

            # Handle payment
            payment_handler = await self._get_payment_handler()
            payment_result = await payment_handler.handle_payment(
                challenge_id=e.challenge_id,
                amount=e.amount,
                chain_hint=e.chain_hint,
                pay_to=e.pay_to,
                description=e.description,
            )

            if not payment_result["success"]:
                raise Exception(f"Payment failed: {payment_result.get('error')}")

            # Retry request with idempotency key
            return await self.request(
                method, path, body, idempotency_key=e.challenge_id
            )

    async def _get_payment_handler(self):
        """Get or create payment handler"""
        if self._payment_handler is None:
            from .payment.handler import PaymentHandler

            self._payment_handler = PaymentHandler(self.payment_provider)
        return self._payment_handler

    @property
    def identity(self):
        """Get identity service"""
        if self._identity_service is None:
            from .services.identity import IdentityService

            self._identity_service = IdentityService(self)
        return self._identity_service

    @property
    def memory(self):
        """Get memory service"""
        if self._memory_service is None:
            from .services.memory import MemoryService

            self._memory_service = MemoryService(self)
        return self._memory_service

    @property
    def collective(self):
        """Get collective service"""
        if self._collective_service is None:
            from .services.collective import CollectiveService

            self._collective_service = CollectiveService(self)
        return self._collective_service

    @property
    def budget(self):
        """Get budget service"""
        if self._budget_service is None:
            from .services.budget import BudgetService

            self._budget_service = BudgetService(self)
        return self._budget_service

    @property
    def receipts(self):
        """Get receipts service"""
        if self._receipts_service is None:
            from .services.receipts import ReceiptsService

            self._receipts_service = ReceiptsService(self)
        return self._receipts_service

    @property
    def reputation(self):
        """Get reputation service"""
        if self._reputation_service is None:
            from .services.reputation import ReputationService

            self._reputation_service = ReputationService(self)
        return self._reputation_service

    @property
    def extraction(self):
        """Get extraction service"""
        if self._extraction_service is None:
            from .services.extraction import ExtractionService

            self._extraction_service = ExtractionService(self)
        return self._extraction_service

    @property
    def facilitators(self):
        """Get facilitator service"""
        if self._facilitator_service is None:
            from .services.facilitator import FacilitatorService

            self._facilitator_service = FacilitatorService(self)
        return self._facilitator_service

    @property
    def sessions(self):
        """Get session service"""
        if self._session_service is None:
            from .services.sessions import SessionService

            self._session_service = SessionService(self)
        return self._session_service

    @property
    def royalty(self):
        """Get royalty service"""
        if self._royalty_service is None:
            from .services.royalty import RoyaltyService

            self._royalty_service = RoyaltyService(self)
        return self._royalty_service

    @property
    def workspaces(self):
        """Get workspace service"""
        if self._workspace_service is None:
            from .services.workspaces import WorkspaceService

            self._workspace_service = WorkspaceService(self)
        return self._workspace_service

    @property
    def owner(self):
        """Get owner service"""
        if self._owner_service is None:
            from .services.owner import OwnerService

            self._owner_service = OwnerService(self)
        return self._owner_service

    async def close(self):
        """Close HTTP client"""
        await self._http_client.close()
