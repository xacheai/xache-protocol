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

__version__ = "5.9.0"

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
    MemoryListItem,
    ListMemoriesResponse,
    ContributeHeuristicRequest,
    ContributeHeuristicResponse,
    QueryCollectiveRequest,
    QueryCollectiveResponse,
    HeuristicMatch,
    BudgetStatus,
    Receipt,
    ReceiptWithProof,
    UsageAnalytics,
    # ERC-8004 types
    ERC8004Network,
    ERC8004FeedbackAuth,
    ERC8004TypedData,
    ERC8004TypedDataDomain,
    ERC8004EnableResponse,
    ERC8004ExportStatus,
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
    WalletService,
    AutoContributeService,
    AutoContributeConfig,
    MemoryHelpers,
)

# Wallet types
from .services.wallet import (
    WalletBalance,
    FundingStatus,
    WalletNetwork,
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

# Graph types
from .graph import Entity, Relationship, Graph, GraphAnswer, GraphExtractionResult
from .services.graph import GraphService

# Ephemeral Context
from .services.ephemeral import EphemeralService

# Cognitive Fingerprints
from .crypto.fingerprint import (
    COGNITIVE_CATEGORIES,
    generate_fingerprint,
    extract_concepts,
    classify_category,
)

# Subject Keys
from .crypto.subject import (
    SubjectId,
    MemoryScope,
    SegmentId,
    TenantId,
    SubjectContext,
    SubjectRetrievalContext,
    SubjectDerivationOptions,
    derive_subject_id,
    is_valid_subject_id,
    is_valid_scope,
    create_subject_context,
    create_segment_context,
    create_global_context,
    validate_subject_context,
    derive_entity_key,
    batch_derive_subject_ids,
    batch_derive_entity_keys,
)

# Standard Contexts
from .constants.standard_contexts import StandardContexts

# Batch Utilities
from .utils.batch import batch_process, batch_process_with_concurrency, BatchItemResult, BatchResult

# Utilities
from .utils.retry import RetryPolicy, with_retry
from .utils.cache import CacheConfig, LRUCache

# Signer Abstraction (for external wallet/signer integration)
from .crypto.signer import (
    XacheSigner,
    XacheWalletProvider,
    SigningAdapter,
    PrivateKeySigningAdapter,
    ExternalSignerAdapter,
    WalletProviderAdapter,
    ReadOnlySigningAdapter,
    create_signing_adapter,
)
from .crypto.signer_helpers import (
    create_signer_from_eth_account,
    create_signer_from_solana_keypair,
)

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
    "MemoryListItem",
    "ListMemoriesResponse",
    "ContributeHeuristicRequest",
    "ContributeHeuristicResponse",
    "QueryCollectiveRequest",
    "QueryCollectiveResponse",
    "HeuristicMatch",
    "BudgetStatus",
    "Receipt",
    "ReceiptWithProof",
    "UsageAnalytics",
    # ERC-8004 types
    "ERC8004Network",
    "ERC8004FeedbackAuth",
    "ERC8004TypedData",
    "ERC8004TypedDataDomain",
    "ERC8004EnableResponse",
    "ERC8004ExportStatus",
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
    "WalletService",
    "AutoContributeService",
    "AutoContributeConfig",
    "MemoryHelpers",
    # Wallet types
    "WalletBalance",
    "FundingStatus",
    "WalletNetwork",
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
    # Subject Keys
    "SubjectId",
    "MemoryScope",
    "SegmentId",
    "TenantId",
    "SubjectContext",
    "SubjectRetrievalContext",
    "SubjectDerivationOptions",
    "derive_subject_id",
    "is_valid_subject_id",
    "is_valid_scope",
    "create_subject_context",
    "create_segment_context",
    "create_global_context",
    "validate_subject_context",
    "derive_entity_key",
    "batch_derive_subject_ids",
    "batch_derive_entity_keys",
    # Standard Contexts
    "StandardContexts",
    # Batch Utilities
    "batch_process",
    "batch_process_with_concurrency",
    "BatchItemResult",
    "BatchResult",
    # Utilities
    "RetryPolicy",
    "with_retry",
    "CacheConfig",
    "LRUCache",
    # Signer Abstraction
    "XacheSigner",
    "XacheWalletProvider",
    "SigningAdapter",
    "PrivateKeySigningAdapter",
    "ExternalSignerAdapter",
    "WalletProviderAdapter",
    "ReadOnlySigningAdapter",
    "create_signing_adapter",
    "create_signer_from_eth_account",
    "create_signer_from_solana_keypair",
    # Wallet generation
    "WalletGenerator",
    "WalletGenerationResult",
    "WalletGenerationOptions",
    # Graph
    "Entity",
    "Relationship",
    "Graph",
    "GraphAnswer",
    "GraphExtractionResult",
    "GraphService",
    # Ephemeral Context
    "EphemeralService",
    # Cognitive Fingerprints
    "COGNITIVE_CATEGORIES",
    "generate_fingerprint",
    "extract_concepts",
    "classify_category",
]
