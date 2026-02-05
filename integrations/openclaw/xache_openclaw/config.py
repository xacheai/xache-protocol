"""
Configuration management for Xache OpenClaw integration

Allows global configuration so tools don't need credentials passed every time.

WARNING: Global configuration is not thread-safe and should be set once at startup.
For multi-tenant applications, pass configuration explicitly to avoid credential leakage.
"""

import os
import threading
import warnings
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class XacheConfig:
    """
    Configuration for Xache integration.

    Can be set via:
    1. Direct initialization
    2. Environment variables (XACHE_WALLET_ADDRESS, XACHE_PRIVATE_KEY, etc.)
    3. OpenClaw's environment management
    """
    wallet_address: str = ""
    private_key: str = ""
    api_url: str = field(default_factory=lambda: os.environ.get("XACHE_API_URL", "https://api.xache.xyz"))
    chain: str = field(default_factory=lambda: os.environ.get("XACHE_CHAIN", "base"))
    network: str = field(default_factory=lambda: os.environ.get("XACHE_NETWORK", "base-sepolia"))
    timeout: int = 30000
    debug: bool = field(default_factory=lambda: os.environ.get("XACHE_DEBUG", "").lower() == "true")

    def __post_init__(self):
        # Load from environment if not provided
        if not self.wallet_address:
            self.wallet_address = os.environ.get("XACHE_WALLET_ADDRESS", "")
        if not self.private_key:
            self.private_key = os.environ.get("XACHE_PRIVATE_KEY", "")

    @property
    def did(self) -> str:
        """Generate DID from wallet address"""
        if not self.wallet_address:
            return ""
        chain_prefix = "sol" if self.chain == "solana" else "evm"
        return f"did:agent:{chain_prefix}:{self.wallet_address.lower()}"

    def is_valid(self) -> bool:
        """Check if config has required fields"""
        return bool(self.wallet_address and self.private_key)


# Global config instance with thread lock
_config: Optional[XacheConfig] = None
_config_lock = threading.Lock()
_config_set_count = 0


def get_config() -> XacheConfig:
    """
    Get the current Xache configuration.

    Returns:
        XacheConfig instance (creates from env vars if not set)

    Example:
        ```python
        from xache_openclaw import get_config

        config = get_config()
        print(f"Using wallet: {config.wallet_address}")
        ```
    """
    global _config
    with _config_lock:
        if _config is None:
            _config = XacheConfig()
        return _config


def set_config(
    wallet_address: Optional[str] = None,
    private_key: Optional[str] = None,
    api_url: Optional[str] = None,
    chain: Optional[str] = None,
    network: Optional[str] = None,
    timeout: Optional[int] = None,
    debug: Optional[bool] = None,
) -> XacheConfig:
    """
    Set the global Xache configuration.

    Args:
        wallet_address: Wallet address for authentication
        private_key: Private key for signing
        api_url: Xache API URL
        chain: Chain type ('base' or 'solana')
        network: Network name ('base-sepolia', 'base-mainnet', 'solana-devnet')
        timeout: Request timeout in milliseconds
        debug: Enable debug logging

    Returns:
        The updated XacheConfig instance

    Example:
        ```python
        from xache_openclaw import set_config

        set_config(
            wallet_address="0x...",
            private_key="0x...",
            chain="base",
            network="base-sepolia"
        )
        ```

    Warning:
        This sets global state. In multi-tenant applications, pass configuration
        explicitly to each tool/function to avoid credential leakage between users.
    """
    global _config, _config_set_count

    with _config_lock:
        _config_set_count += 1

        # Warn if config is being set multiple times (potential multi-tenant issue)
        if _config_set_count > 1:
            warnings.warn(
                "Xache config is being set multiple times. "
                "In multi-tenant applications, pass configuration explicitly to avoid credential leakage.",
                UserWarning,
                stacklevel=2
            )

        current = _config if _config is not None else XacheConfig()

        _config = XacheConfig(
            wallet_address=wallet_address if wallet_address is not None else current.wallet_address,
            private_key=private_key if private_key is not None else current.private_key,
            api_url=api_url if api_url is not None else current.api_url,
            chain=chain if chain is not None else current.chain,
            network=network if network is not None else current.network,
            timeout=timeout if timeout is not None else current.timeout,
            debug=debug if debug is not None else current.debug,
        )

        return _config


def clear_config() -> None:
    """
    Clear the global configuration.

    This is primarily for testing. In production, configuration should
    be set once at startup and not changed.
    """
    global _config, _config_set_count
    with _config_lock:
        _config = None
        _config_set_count = 0
