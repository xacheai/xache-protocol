"""
Signer abstraction for Xache Protocol Python SDK.

Supports three signing modes:
1. Raw private key (existing, backward compatible)
2. External signer (XacheSigner protocol)
3. Wallet provider (XacheWalletProvider protocol, lazy resolution)

Example:
    # Mode 1: Raw private key (unchanged)
    client = XacheClient(api_url=..., did=..., private_key="0x...")

    # Mode 2: External signer
    signer = create_signer_from_eth_account(account)
    client = XacheClient(api_url=..., did=..., signer=signer)

    # Mode 3: Wallet provider
    client = XacheClient(api_url=..., did=..., wallet_provider=provider)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@runtime_checkable
class XacheSigner(Protocol):
    """
    Wallet-agnostic signer protocol.
    Compatible with eth_account, solders, and custom implementations.
    """

    async def get_address(self) -> str:
        """Get wallet address"""
        ...

    async def sign_message(self, message: bytes) -> bytes:
        """
        Sign raw message bytes.
        For EVM: sign keccak256 hash with secp256k1, return 65-byte (r+s+v) signature.
        For Solana: sign with ed25519, return 64-byte signature.
        """
        ...

    async def sign_typed_data(
        self,
        domain: Dict[str, Any],
        types: Dict[str, List[Dict[str, str]]],
        value: Dict[str, Any],
    ) -> str:
        """
        Sign EIP-712 typed data (EVM only).
        Returns hex-encoded signature.
        """
        ...


@runtime_checkable
class XacheWalletProvider(Protocol):
    """
    Wallet provider protocol for lazy signer resolution.
    """

    async def get_signer(self) -> XacheSigner:
        """Get signer instance"""
        ...

    async def get_address(self) -> str:
        """Get wallet address"""
        ...

    def get_chain_type(self) -> str:
        """Get chain type ('evm' or 'solana')"""
        ...


# ============================================================
# Base SigningAdapter ABC
# ============================================================


class SigningAdapter(ABC):
    """Base signing adapter — all signing operations flow through this."""

    @abstractmethod
    async def get_address(self) -> str:
        ...

    @abstractmethod
    def get_chain_type(self) -> str:
        ...

    @abstractmethod
    async def sign_auth_message(self, message: str) -> str:
        ...

    @abstractmethod
    def get_private_key(self) -> Optional[str]:
        ...

    @abstractmethod
    async def get_encryption_seed(self) -> str:
        ...

    @abstractmethod
    def has_private_key(self) -> bool:
        ...


# ============================================================
# PrivateKeySigningAdapter — wraps raw private key
# ============================================================


class PrivateKeySigningAdapter(SigningAdapter):
    """Adapter backed by a raw private key. Preserves existing behavior exactly."""

    def __init__(
        self,
        private_key: str,
        did: str,
        encryption_key: Optional[str] = None,
    ) -> None:
        self._private_key = private_key
        self._did = did
        self._encryption_key = encryption_key

    async def get_address(self) -> str:
        return self._did.split(":")[3]

    def get_chain_type(self) -> str:
        return "evm" if ":evm:" in self._did else "solana"

    async def sign_auth_message(self, message: str) -> str:
        from .signing import sign_message

        return sign_message(message, self._private_key, self._did)

    def get_private_key(self) -> Optional[str]:
        return self._private_key

    async def get_encryption_seed(self) -> str:
        return self._encryption_key or self._private_key

    def has_private_key(self) -> bool:
        return True


# ============================================================
# ExternalSignerAdapter — wraps XacheSigner
# ============================================================


class ExternalSignerAdapter(SigningAdapter):
    """Adapter backed by an external XacheSigner protocol implementation."""

    def __init__(
        self,
        signer: XacheSigner,
        did: str,
        encryption_key: Optional[str] = None,
    ) -> None:
        self._signer = signer
        self._did = did
        self._encryption_key = encryption_key
        self._cached_address: Optional[str] = None

    async def get_address(self) -> str:
        if not self._cached_address:
            self._cached_address = await self._signer.get_address()
        return self._cached_address

    def get_chain_type(self) -> str:
        return "evm" if ":evm:" in self._did else "solana"

    async def sign_auth_message(self, message: str) -> str:
        if self.get_chain_type() == "evm":
            # EVM auth: raw keccak256 hash + secp256k1 sign
            from eth_hash.auto import keccak

            msg_bytes = message.encode("utf-8")
            msg_hash = keccak(msg_bytes)
            sig_bytes = await self._signer.sign_message(msg_hash)
            return sig_bytes.hex()
        else:
            # Solana auth: ed25519 sign → base58
            import base58 as b58

            msg_bytes = message.encode("utf-8")
            sig_bytes = await self._signer.sign_message(msg_bytes)
            return b58.b58encode(sig_bytes).decode("ascii")

    def get_private_key(self) -> Optional[str]:
        return None

    async def get_encryption_seed(self) -> str:
        if self._encryption_key:
            return self._encryption_key
        # Fallback: use wallet address as seed
        return await self.get_address()

    def has_private_key(self) -> bool:
        return False


# ============================================================
# WalletProviderAdapter — wraps XacheWalletProvider (lazy)
# ============================================================


class WalletProviderAdapter(SigningAdapter):
    """Adapter backed by a lazy XacheWalletProvider. Resolves signer on first use."""

    def __init__(
        self,
        provider: XacheWalletProvider,
        did: str,
        encryption_key: Optional[str] = None,
    ) -> None:
        self._provider = provider
        self._did = did
        self._encryption_key = encryption_key
        self._resolved: Optional[ExternalSignerAdapter] = None

    async def _resolve(self) -> ExternalSignerAdapter:
        if not self._resolved:
            signer = await self._provider.get_signer()
            self._resolved = ExternalSignerAdapter(
                signer, self._did, self._encryption_key
            )
        return self._resolved

    async def get_address(self) -> str:
        return await (await self._resolve()).get_address()

    def get_chain_type(self) -> str:
        return "evm" if ":evm:" in self._did else "solana"

    async def sign_auth_message(self, message: str) -> str:
        return await (await self._resolve()).sign_auth_message(message)

    def get_private_key(self) -> Optional[str]:
        return None

    async def get_encryption_seed(self) -> str:
        return await (await self._resolve()).get_encryption_seed()

    def has_private_key(self) -> bool:
        return False


# ============================================================
# ReadOnlySigningAdapter — no signing capability
# ============================================================


class ReadOnlySigningAdapter(SigningAdapter):
    """Adapter for read-only mode (no signing capability)."""

    def __init__(self, did: str) -> None:
        self._did = did

    async def get_address(self) -> str:
        return self._did.split(":")[3]

    def get_chain_type(self) -> str:
        return "evm" if ":evm:" in self._did else "solana"

    async def sign_auth_message(self, message: str) -> str:
        raise RuntimeError(
            "Cannot sign: client is read-only. "
            "Provide private_key, signer, or wallet_provider to make authenticated requests."
        )

    def get_private_key(self) -> Optional[str]:
        return None

    async def get_encryption_seed(self) -> str:
        return self._did.split(":")[3]

    def has_private_key(self) -> bool:
        return False


# ============================================================
# Factory function
# ============================================================


def create_signing_adapter(
    did: str,
    private_key: Optional[str] = None,
    signer: Optional[Any] = None,
    wallet_provider: Optional[Any] = None,
    encryption_key: Optional[str] = None,
) -> SigningAdapter:
    """
    Create the appropriate signing adapter from configuration.
    Priority: private_key > signer > wallet_provider > ReadOnly
    """
    if private_key:
        return PrivateKeySigningAdapter(private_key, did, encryption_key)
    if signer is not None:
        return ExternalSignerAdapter(signer, did, encryption_key)
    if wallet_provider is not None:
        return WalletProviderAdapter(wallet_provider, did, encryption_key)
    return ReadOnlySigningAdapter(did)
