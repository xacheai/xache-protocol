"""
Xache Protocol Python SDK
Official Python client library for Xache Protocol

Example:
    ```python
    import asyncio
    from xache import XacheClient

    async def main():
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

    asyncio.run(main())
    ```
"""

__version__ = "5.2.0"

# Main client
from .client import XacheClient

# Types
from .types import (
    DID,
    KeyType,
    Chain,
    StorageTier,
    ErrorCode,
    RegisterIdentityRequest,
    RegisterIdentityResponse,
    StoreMemoryRequest,
    StoreMemoryResponse,
    RetrieveMemoryRequest,
    RetrieveMemoryResponse,
    ContributeHeuristicRequest,
    ContributeHeuristicResponse,
    QueryCollectiveRequest,
    QueryCollectiveResponse,
    HeuristicMatch,
    BudgetStatus,
    Receipt,
    ReceiptWithProof,
    UsageAnalytics,
)

# Errors
from .errors import (
    XacheError,
    UnauthenticatedError,
    PaymentRequiredError,
    RateLimitedError,
    BudgetExceededError,
    InvalidInputError,
    ConflictError,
    RetryLaterError,
    InternalError,
    NetworkError,
)

# Services (for type hints)
from .services import (
    IdentityService,
    MemoryService,
    CollectiveService,
    BudgetService,
    ReceiptsService,
    ExtractionService,
)

# Extraction types
from .services.extraction import (
    LLMProvider,
    LLMApiFormat,
    LLMConfig,
    LLMConfigApiKey,
    LLMConfigEndpoint,
    LLMConfigXacheManaged,
    ExtractedMemory,
    ExtractionMetadata,
    ExtractionResult,
    ExtractionOptions,
)

# Utilities
from .utils.retry import RetryPolicy, with_retry
from .utils.cache import CacheConfig, LRUCache

# Wallet generation
from .crypto.wallet import (
    WalletGenerator,
    WalletGenerationResult,
    WalletGenerationOptions,
)

__all__ = [
    "__version__",
    # Main client
    "XacheClient",
    # Types
    "DID",
    "KeyType",
    "Chain",
    "StorageTier",
    "ErrorCode",
    "RegisterIdentityRequest",
    "RegisterIdentityResponse",
    "StoreMemoryRequest",
    "StoreMemoryResponse",
    "RetrieveMemoryRequest",
    "RetrieveMemoryResponse",
    "ContributeHeuristicRequest",
    "ContributeHeuristicResponse",
    "QueryCollectiveRequest",
    "QueryCollectiveResponse",
    "HeuristicMatch",
    "BudgetStatus",
    "Receipt",
    "ReceiptWithProof",
    "UsageAnalytics",
    # Errors
    "XacheError",
    "UnauthenticatedError",
    "PaymentRequiredError",
    "RateLimitedError",
    "BudgetExceededError",
    "InvalidInputError",
    "ConflictError",
    "RetryLaterError",
    "InternalError",
    "NetworkError",
    # Services
    "IdentityService",
    "MemoryService",
    "CollectiveService",
    "BudgetService",
    "ReceiptsService",
    "ExtractionService",
    # Extraction types
    "LLMProvider",
    "LLMApiFormat",
    "LLMConfig",
    "LLMConfigApiKey",
    "LLMConfigEndpoint",
    "LLMConfigXacheManaged",
    "ExtractedMemory",
    "ExtractionMetadata",
    "ExtractionResult",
    "ExtractionOptions",
    # Utilities
    "RetryPolicy",
    "with_retry",
    "CacheConfig",
    "LRUCache",
    # Wallet generation
    "WalletGenerator",
    "WalletGenerationResult",
    "WalletGenerationOptions",
]
