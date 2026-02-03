"""
Type definitions for Xache Protocol SDK
Matching API contracts per LLD §2
"""

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Any
from enum import Enum


# Type aliases
DID = str  # did:agent:<evm|sol>:<address>
KeyType = Literal["evm", "solana"]
Chain = Literal["base", "solana"]
StorageTier = Literal["hot", "warm", "cold"]
ErrorCode = Literal[
    "UNAUTHENTICATED",
    "PAYMENT_REQUIRED",
    "RATE_LIMITED",
    "BUDGET_EXCEEDED",
    "INVALID_INPUT",
    "CONFLICT",
    "RETRY_LATER",
    "INTERNAL",
]


@dataclass
class ResponseMeta:
    """Response metadata per LLD §2.1"""
    request_id: str
    timestamp: str
    duration: int


@dataclass
class APIError:
    """API error details"""
    code: ErrorCode
    message: str
    details: Optional[Dict[str, Any]] = None


@dataclass
class APIResponse:
    """Generic API response wrapper"""
    success: bool
    data: Optional[Any] = None
    error: Optional[APIError] = None
    meta: Optional[ResponseMeta] = None


@dataclass
class Payment402:
    """402 Payment Required response per LLD §2.3"""
    challenge_id: str
    amount: str
    chain_hint: Literal["solana", "base"]
    pay_to: str
    description: str


@dataclass
class XacheClientConfig:
    """Client configuration"""
    api_url: str
    did: DID
    private_key: str
    payment_provider: Optional[Dict[str, Any]] = None
    timeout: int = 30
    debug: bool = False


@dataclass
class RegisterIdentityRequest:
    """Identity registration request per LLD §2.2"""
    wallet_address: str
    key_type: KeyType
    chain: Chain


@dataclass
class RegisterIdentityResponse:
    """Identity registration response"""
    did: DID
    wallet_address: str
    key_type: KeyType
    chain: Chain
    created_at: str


@dataclass
class SubmitClaimRequest:
    """Submit claim request (Option B: Async Claim Approval)"""
    agent_did: DID
    webhook_url: Optional[str] = None


@dataclass
class SubmitClaimResponse:
    """Submit claim response"""
    claim_id: str
    status: str  # 'pending'
    message: str


@dataclass
class ProcessClaimRequest:
    """Process claim request (Option B: Async Claim Approval)"""
    owner_did: DID
    approved: bool
    owner_signature: Optional[str] = None
    agent_signature: Optional[str] = None
    message: Optional[str] = None
    timestamp: Optional[int] = None
    rejection_reason: Optional[str] = None


@dataclass
class ProcessClaimResponse:
    """Process claim response"""
    status: str  # 'approved' or 'rejected'
    message: str


@dataclass
class PendingClaim:
    """Pending claim"""
    claim_id: str
    owner_did: DID
    owner_wallet: str
    requested_at: str
    webhook_url: Optional[str] = None


@dataclass
class PendingClaimByOwner:
    """Pending claim by owner"""
    agent_did: DID
    agent_wallet: str
    requested_at: str
    status: str


@dataclass
class OnChainClaimRequest:
    """On-chain claim request (Option C: On-chain Claiming)"""
    agent_did: DID
    tx_hash: str
    chain: str  # 'solana' or 'base'


@dataclass
class OnChainClaimResponse:
    """On-chain claim response"""
    status: str  # 'approved'
    tx_hash: str
    method: str
    message: str


@dataclass
class StoreMemoryRequest:
    """Memory store request per LLD §2.4"""
    data: Dict[str, Any]
    storage_tier: StorageTier
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class StoreMemoryResponse:
    """Memory store response"""
    memory_id: str
    storage_tier: StorageTier
    size: int
    receipt_id: str


@dataclass
class RetrieveMemoryRequest:
    """Memory retrieve request"""
    memory_id: str


@dataclass
class RetrieveMemoryResponse:
    """Memory retrieve response"""
    memory_id: str
    data: Dict[str, Any]
    storage_tier: StorageTier
    metadata: Optional[Dict[str, Any]]
    receipt_id: str


@dataclass
class BatchStoreMemoryRequest:
    """Batch store memory request per PRD FR-010, LLD §2.3 (max 100 items)"""
    items: List[StoreMemoryRequest]


@dataclass
class BatchStoreMemoryResult:
    """Single result in batch store response"""
    index: int
    memory_id: Optional[str] = None
    receipt_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class BatchStoreMemoryResponse:
    """Batch store memory response per LLD §2.3"""
    results: List[BatchStoreMemoryResult]
    success_count: int
    failure_count: int
    batch_receipt_id: str


@dataclass
class BatchRetrieveMemoryRequest:
    """Batch retrieve memory request per PRD FR-011, LLD §2.3 (max 100 items)"""
    memory_ids: List[str]


@dataclass
class BatchRetrieveMemoryResult:
    """Single result in batch retrieve response"""
    index: int
    memory_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    storage_tier: Optional[StorageTier] = None
    metadata: Optional[Dict[str, Any]] = None
    receipt_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class BatchRetrieveMemoryResponse:
    """Batch retrieve memory response per LLD §2.3"""
    results: List[BatchRetrieveMemoryResult]
    success_count: int
    failure_count: int
    batch_receipt_id: str


@dataclass
class HeuristicMetrics:
    """Heuristic metrics per LLD §2.4"""
    success_rate: float  # 0.00 to 1.00
    sample_size: int  # Number of samples
    confidence: float  # 0.00 to 1.00


@dataclass
class ContributeHeuristicRequest:
    """Collective contribute request per LLD §2.5"""
    pattern: str  # Pattern text (10-500 chars)
    pattern_hash: str  # Hash of pattern for deduplication
    domain: str  # Domain (e.g., 'javascript', 'python', 'devops')
    tags: List[str]  # Tags for categorization (1-10 tags)
    metrics: HeuristicMetrics  # Metrics per LLD §2.4
    encrypted_content_ref: str  # Reference to encrypted content in R2
    context_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ContributeHeuristicResponse:
    """Collective contribute response"""
    heuristic_id: str
    pattern: str
    domain: str
    tags: List[str]
    receipt_id: str


@dataclass
class HeuristicMatch:
    """Heuristic match in query results"""
    heuristic_id: str
    pattern: str
    domain: str
    tags: List[str]
    contributor_did: DID
    relevance_score: float
    royalty_amount: str


@dataclass
class QueryCollectiveRequest:
    """Collective query request"""
    query_text: str
    domain: Optional[str] = None
    limit: int = 10


@dataclass
class QueryCollectiveResponse:
    """Collective query response"""
    matches: List[HeuristicMatch]
    total_cost: str
    royalties_usd: str
    receipt_id: str


@dataclass
class BudgetStatus:
    """Budget status"""
    limit_cents: int
    spent_cents: int
    remaining_cents: int
    percentage_used: float
    current_period: str


class BudgetAlertLevel(Enum):
    """Budget alert levels per HLD §2.2 Budget Guardian"""
    WARN_50 = "WARN_50"  # 50% threshold warning
    WARN_80 = "WARN_80"  # 80% threshold warning
    CRITICAL_100 = "CRITICAL_100"  # 100% critical threshold


@dataclass
class BudgetAlert:
    """Budget alert details"""
    level: BudgetAlertLevel  # Alert severity level
    threshold: float  # Threshold percentage that triggered alert (50, 80, or 100)
    percentage_used: float  # Current budget usage percentage
    spent_cents: int  # Amount spent in cents
    limit_cents: int  # Budget limit in cents
    remaining_cents: int  # Remaining budget in cents
    message: str  # Human-readable alert message
    timestamp: str  # Timestamp when alert was triggered


# Budget alert handler callback type
BudgetAlertHandler = Any  # Callable[[BudgetAlert], None] or async version


@dataclass
class Receipt:
    """Receipt record"""
    receipt_id: str
    agent_did: DID
    operation: str
    amount_usd: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ReceiptWithProof:
    """Receipt with Merkle proof"""
    receipt_id: str
    merkle_proof: List[str]
    merkle_root: str


@dataclass
class UsageAnalytics:
    """Usage analytics"""
    operations: List[Dict[str, Any]]
    total_spent: str
    period: Dict[str, str]


@dataclass
class ReputationSnapshot:
    """Reputation snapshot per HLD §2.2"""
    agent_did: DID
    timestamp: str
    overall: float  # Overall reputation score (0-100)
    memory_quality: float  # Memory quality score (0-100)
    contrib_success: float  # Contribution success score (0-100)
    economic_value: float  # Economic value score (0-100)
    network_influence: float  # Network influence score (0-100)
    reliability: float  # Reliability score (0-100)
    specialization: float  # Specialization score (0-100)
    weights: Dict[str, float]  # Score weights


@dataclass
class DomainReputation:
    """Domain-specific reputation per HLD §2.2"""
    domain: str  # Domain name (e.g., 'javascript', 'python', 'devops')
    score: float  # Domain-specific reputation score (0-100)
    contribution_count: int  # Number of contributions in this domain
    success_rate: float  # Success rate in this domain (0.00 to 1.00)
    total_earned_usd: str  # Total earnings in USD for this domain


@dataclass
class TopAgent:
    """Top agent entry for leaderboard"""
    agent_did: DID
    wallet_address: str
    reputation_score: float  # Overall reputation score (0-100)
    operation_count: int  # Total number of operations
    total_earned_usd: str  # Total earned in USD
