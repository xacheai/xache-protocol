"""
Xache Protocol Python SDK
Main client class
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Dict, List, Literal, Optional

from .crypto.signing import (
    derive_evm_address,
    derive_solana_address,
    generate_auth_headers,
    generate_auth_headers_async,
    validate_did,
)
from .crypto.signer import (
    SigningAdapter,
    ReadOnlySigningAdapter,
    create_signing_adapter,
)
from .crypto.subject import (
    SubjectContext,
    SubjectDerivationOptions,
    SubjectId,
    batch_derive_subject_ids,
    create_global_context,
    create_segment_context,
    create_subject_context,
    derive_subject_id,
)
from .errors import PaymentRequiredError
from .types import APIResponse
from .utils.http import HttpClient

if TYPE_CHECKING:
    from types import TracebackType

    from .payment.handler import PaymentHandler
    from .services.auto_contribute import AutoContributeService
    from .services.budget import BudgetService
    from .services.collective import CollectiveService
    from .services.extraction import ExtractionService
    from .services.facilitator import FacilitatorService
    from .services.graph import GraphService
    from .services.identity import IdentityService
    from .services.memory import MemoryService
    from .services.memory_helpers import MemoryHelpers
    from .services.owner import OwnerService
    from .services.receipts import ReceiptsService
    from .services.reputation import ReputationService
    from .services.royalty import RoyaltyService
    from .services.sessions import SessionService
    from .services.wallet import WalletService
    from .services.workspaces import WorkspaceService


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
        private_key: Optional[str] = None,
        signer: Optional[Any] = None,
        wallet_provider: Optional[Any] = None,
        encryption_key: Optional[str] = None,
        payment_provider: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
        debug: bool = False,
    ) -> None:
        # Validate configuration
        self._validate_config(api_url, did, private_key)

        # Store configuration
        self.api_url = api_url
        self.did = did
        self.private_key = private_key  # Can be None when using signer/wallet_provider
        self.payment_provider = payment_provider
        self.timeout = timeout
        self.debug = debug

        # Create signing adapter (private_key > signer > wallet_provider > ReadOnly)
        self._signing_adapter: SigningAdapter = create_signing_adapter(
            did=did,
            private_key=private_key,
            signer=signer,
            wallet_provider=wallet_provider,
            encryption_key=encryption_key,
        )

        # Initialize HTTP client
        self._http_client = HttpClient(timeout=timeout, debug=debug)

        # Initialize payment handler (lazy loading)
        self._payment_handler: Optional[PaymentHandler] = None

        # Initialize services (lazy loading)
        self._identity_service: Optional[IdentityService] = None
        self._memory_service: Optional[MemoryService] = None
        self._collective_service: Optional[CollectiveService] = None
        self._budget_service: Optional[BudgetService] = None
        self._receipts_service: Optional[ReceiptsService] = None
        self._reputation_service: Optional[ReputationService] = None
        self._extraction_service: Optional[ExtractionService] = None
        self._facilitator_service: Optional[FacilitatorService] = None
        self._session_service: Optional[SessionService] = None
        self._royalty_service: Optional[RoyaltyService] = None
        self._workspace_service: Optional[WorkspaceService] = None
        self._owner_service: Optional[OwnerService] = None
        self._wallet_service: Optional[WalletService] = None
        self._graph_service: Optional[GraphService] = None
        self._auto_contribute_service: Optional[AutoContributeService] = None
        self._memory_helpers: Optional[MemoryHelpers] = None

        if self.debug:
            print(f"Xache client initialized: api_url={api_url}, did={did}")

    async def __aenter__(self) -> "XacheClient":
        """Async context manager entry"""
        await self._http_client.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: Optional[type],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        """Async context manager exit"""
        await self._http_client.__aexit__(exc_type, exc_val, exc_tb)

    def _validate_config(self, api_url: str, did: str, private_key: Optional[str]) -> None:
        """Validate client configuration"""
        if not api_url:
            raise ValueError("api_url is required")

        if not did:
            raise ValueError("did is required")

        if not validate_did(did):
            raise ValueError(
                f"Invalid DID format: {did}. Expected: did:agent:<evm|sol>:<address>"
            )

        # private_key is optional — only validate if provided
        if private_key:
            # Validate private key format (hex string)
            # EVM (secp256k1): 64 chars (32 bytes)
            # Solana (ed25519): 64 chars (32-byte seed) or 128 chars (64-byte full keypair)
            clean_key = private_key[2:] if private_key.startswith("0x") else private_key
            is_valid_hex = all(c in "0123456789abcdefABCDEF" for c in clean_key)
            is_valid_length = len(clean_key) in (64, 128)

            if not is_valid_hex or not is_valid_length:
                raise ValueError(
                    "private_key must be a 64-character (EVM) or 64/128-character (Solana) hex string"
                )

            # Cross-validate: ensure private key matches the address in the DID
            did_parts = did.split(":")
            chain = did_parts[2]  # 'evm' or 'sol'
            did_address = did_parts[3]  # wallet address

            try:
                if chain == "evm":
                    derived_address = derive_evm_address(clean_key)
                    if derived_address.lower() != did_address.lower():
                        raise ValueError(
                            f"Private key does not match DID address. "
                            f"Expected: {did_address.lower()}, Got: {derived_address.lower()}"
                        )
                elif chain == "sol":
                    derived_address = derive_solana_address(clean_key)
                    if derived_address != did_address:
                        raise ValueError(
                            f"Private key does not match DID address. "
                            f"Expected: {did_address}, Got: {derived_address}"
                        )
            except ValueError:
                raise
            except Exception as e:
                raise ValueError(f"Failed to validate private key: {str(e)}")

    async def request(
        self,
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"],
        path: str,
        body: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        skip_auth: bool = False,
    ) -> APIResponse:
        """Make authenticated API request"""
        url = f"{self.api_url}{path}"
        body_str = json.dumps(body) if body else ""

        # Build headers
        headers: Dict[str, str] = {}

        # Add authentication headers (unless skipped)
        if not skip_auth:
            if isinstance(self._signing_adapter, ReadOnlySigningAdapter):
                raise RuntimeError(
                    "private_key, signer, or wallet_provider is required for "
                    "authenticated requests. This client is read-only."
                )
            auth_headers = await generate_auth_headers_async(
                method, path, body_str, self.did, self._signing_adapter
            )
            headers.update(auth_headers)

        # Add idempotency key if provided
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        if self.debug:
            # Redact sensitive headers for logging
            safe_headers = {**headers}
            if "X-Sig" in safe_headers:
                safe_headers["X-Sig"] = "[REDACTED]"
            print(f"{method} {path}", {"body": body, "headers": safe_headers})

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
        """Make authenticated API request with automatic 402 payment handling"""
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

    async def _get_payment_handler(self) -> "PaymentHandler":
        """Get or create payment handler"""
        if self._payment_handler is None:
            from .payment.handler import PaymentHandler

            self._payment_handler = PaymentHandler(self.payment_provider)
        return self._payment_handler

    @property
    def identity(self) -> "IdentityService":
        """Get identity service"""
        if self._identity_service is None:
            from .services.identity import IdentityService

            self._identity_service = IdentityService(self)
        return self._identity_service

    @property
    def memory(self) -> "MemoryService":
        """Get memory service"""
        if self._memory_service is None:
            from .services.memory import MemoryService

            self._memory_service = MemoryService(self)
        return self._memory_service

    @property
    def collective(self) -> "CollectiveService":
        """Get collective service"""
        if self._collective_service is None:
            from .services.collective import CollectiveService

            self._collective_service = CollectiveService(self)
        return self._collective_service

    @property
    def budget(self) -> "BudgetService":
        """Get budget service"""
        if self._budget_service is None:
            from .services.budget import BudgetService

            self._budget_service = BudgetService(self)
        return self._budget_service

    @property
    def receipts(self) -> "ReceiptsService":
        """Get receipts service"""
        if self._receipts_service is None:
            from .services.receipts import ReceiptsService

            self._receipts_service = ReceiptsService(self)
        return self._receipts_service

    @property
    def reputation(self) -> "ReputationService":
        """Get reputation service"""
        if self._reputation_service is None:
            from .services.reputation import ReputationService

            self._reputation_service = ReputationService(self)
        return self._reputation_service

    @property
    def extraction(self) -> "ExtractionService":
        """Get extraction service"""
        if self._extraction_service is None:
            from .services.extraction import ExtractionService

            self._extraction_service = ExtractionService(self)
        return self._extraction_service

    @property
    def facilitators(self) -> "FacilitatorService":
        """Get facilitator service"""
        if self._facilitator_service is None:
            from .services.facilitator import FacilitatorService

            self._facilitator_service = FacilitatorService(self)
        return self._facilitator_service

    @property
    def sessions(self) -> "SessionService":
        """Get session service"""
        if self._session_service is None:
            from .services.sessions import SessionService

            self._session_service = SessionService(self)
        return self._session_service

    @property
    def royalty(self) -> "RoyaltyService":
        """Get royalty service"""
        if self._royalty_service is None:
            from .services.royalty import RoyaltyService

            self._royalty_service = RoyaltyService(self)
        return self._royalty_service

    @property
    def workspaces(self) -> "WorkspaceService":
        """Get workspace service"""
        if self._workspace_service is None:
            from .services.workspaces import WorkspaceService

            self._workspace_service = WorkspaceService(self)
        return self._workspace_service

    @property
    def owner(self) -> "OwnerService":
        """Get owner service"""
        if self._owner_service is None:
            from .services.owner import OwnerService

            self._owner_service = OwnerService(self)
        return self._owner_service

    @property
    def wallet(self) -> "WalletService":
        """Get wallet service"""
        if self._wallet_service is None:
            from .services.wallet import WalletService

            self._wallet_service = WalletService(self)
        return self._wallet_service

    @property
    def graph(self) -> "GraphService":
        """Get graph service (knowledge graph)"""
        if self._graph_service is None:
            from .services.graph import GraphService

            self._graph_service = GraphService(self)
        return self._graph_service

    @property
    def auto_contribute(self) -> "AutoContributeService":
        """Get auto-contribute service"""
        if self._auto_contribute_service is None:
            from .services.auto_contribute import AutoContributeService

            self._auto_contribute_service = AutoContributeService(self)
        return self._auto_contribute_service

    @property
    def helpers(self) -> "MemoryHelpers":
        """Get memory helpers (convenience methods)"""
        if self._memory_helpers is None:
            from .services.memory_helpers import MemoryHelpers

            self._memory_helpers = MemoryHelpers(self)
        return self._memory_helpers

    @property
    def signing_adapter(self) -> "SigningAdapter":
        """Get signing adapter (for internal use by services)"""
        return self._signing_adapter

    def is_read_only(self) -> bool:
        """Check if client is in read-only mode (no signing capability)"""
        return isinstance(self._signing_adapter, ReadOnlySigningAdapter)

    # ============================================================
    # Subject Keys Methods
    # ============================================================

    async def derive_subject_id(
        self,
        raw_subject_id: str,
        options: Optional[SubjectDerivationOptions] = None,
    ) -> SubjectId:
        """
        Derive a pseudonymous subject ID for multi-tenant memory isolation.

        Uses HMAC-SHA256 to create an irreversible, deterministic identifier.

        Args:
            raw_subject_id: Raw subject identifier (customer ID, user email, etc.)
            options: Optional derivation configuration

        Returns:
            64-character hex string (pseudonymous subject ID)
        """
        enc_key = await self.memory.get_current_encryption_key()
        return derive_subject_id(enc_key, raw_subject_id, options)

    async def batch_derive_subject_ids(
        self,
        raw_subject_ids: List[str],
        options: Optional[SubjectDerivationOptions] = None,
    ) -> Dict[str, SubjectId]:
        """
        Batch derive subject IDs for multiple raw identifiers.

        Args:
            raw_subject_ids: Array of raw subject identifiers
            options: Optional derivation configuration

        Returns:
            Dict mapping raw ID to derived subject ID
        """
        enc_key = await self.memory.get_current_encryption_key()
        return batch_derive_subject_ids(enc_key, raw_subject_ids, options)

    @staticmethod
    def create_subject_context(
        subject_id: str,
        tenant_id: Optional[str] = None,
    ) -> SubjectContext:
        """Create a SUBJECT-scoped context."""
        return create_subject_context(subject_id, tenant_id)

    @staticmethod
    def create_segment_context(
        segment_id: str,
        tenant_id: Optional[str] = None,
    ) -> SubjectContext:
        """Create a SEGMENT-scoped context."""
        return create_segment_context(segment_id, tenant_id)

    @staticmethod
    def create_global_context(
        tenant_id: Optional[str] = None,
    ) -> SubjectContext:
        """Create a GLOBAL-scoped context."""
        return create_global_context(tenant_id)

    async def close(self) -> None:
        """Close HTTP client"""
        await self._http_client.close()
