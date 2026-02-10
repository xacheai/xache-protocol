# @xache/common

Shared business logic for Xache Protocol - reputation, budget, pricing, and receipt management.

## Overview

Production-ready business logic modules:
- **Reputation Engine**: Calculate and manage agent reputation scores
- **Budget Management**: Track spending, enforce limits, auto-throttle
- **Pricing Engine**: Dynamic pricing with reputation multipliers and royalties
- **Receipt Management**: Generate, verify, and anchor payment receipts

## Installation

```bash
npm install @xache/common
```

## Usage

### Reputation Engine

```typescript
import {
  calculateReputationScore,
  updateReputationScores,
  getReputationStatus,
  calculateContributionBoost,
} from '@xache/common';

// Calculate reputation from metrics
const metrics = {
  totalOperations: 150,
  successfulOperations: 142,
  failedOperations: 8,
  totalContributionValue: 5.50, // USD
  avgResponseTime: 850, // ms
  daysSinceLastActivity: 0,
};

const score = calculateReputationScore(metrics);
console.log(score); // 0.7234 (0.0 - 1.0)

// Update reputation after operation
const currentScores = {
  overallScore: 0.72,
  totalOperations: 150,
  successfulOperations: 142,
  failedOperations: 8,
  totalContributionValue: 5.50,
  avgResponseTime: 850,
  lastUpdated: Math.floor(Date.now() / 1000),
};

const updatedScores = updateReputationScores(
  currentScores,
  true, // operation succeeded
  750  // response time in ms
);

// Get reputation status
const status = getReputationStatus(0.85);
console.log(status);
// {
//   tier: "TIER_5",
//   multiplier: 1.5,
//   status: "elite",
//   discount: false,
//   premium: true
// }

// Calculate boost from contribution
const newScore = calculateContributionBoost(0.65, 1.50); // +$1.50 contribution
console.log(newScore); // 0.6650 (boosted)
```

### Budget Management

```typescript
import {
  calculateBudgetStatus,
  shouldThrottle,
  shouldBlockOperation,
  updateBudget,
  getBudgetRecommendations,
} from '@xache/common';

// Check budget status
const status = calculateBudgetStatus('18.50', '25.00');
console.log(status);
// {
//   currentSpent: "18.500000",
//   monthlyLimit: "25.00",
//   remaining: "6.500000",
//   percentageUsed: 74,
//   status: "warning",
//   warnings: ["50% budget used", "80% budget used"]
// }

// Check if should throttle
if (shouldThrottle('22.50', '25.00')) {
  console.log('Auto-throttle active: 90% budget used');
}

// Check if operation should be blocked
const operationCost = '5.00';
if (shouldBlockOperation('24.50', operationCost, '25.00')) {
  throw new Error('Budget exceeded (including grace period)');
}

// Update budget after operation
const currentBudget = {
  monthlyLimit: '25.00',
  currentSpent: '18.50',
  autoThrottleEnabled: true,
  lastResetDate: '2025-01-01',
};

const updatedBudget = updateBudget(currentBudget, '0.002');
console.log(updatedBudget.currentSpent); // "18.502000"

// Get budget recommendations
const recommendations = getBudgetRecommendations(
  '18.50',
  '25.00',
  15 // days elapsed
);
console.log(recommendations);
// {
//   status: "warning",
//   recommendation: "Warning: Projected spend ($37.00) exceeds budget by 48%. Consider increasing limit.",
//   projectedSpend: "37.00"
// }
```

### Pricing Engine

```typescript
import {
  calculateOperationPrice,
  calculateBatchDiscount,
  calculateRoyalty,
  selectOptimalChain,
  calculateCollectiveQueryPrice,
  getPricingSummary,
} from '@xache/common';

// Calculate operation price with reputation
const pricing = calculateOperationPrice(
  'MEMORY_STORE',
  0.85, // reputation score
  0.10  // domain bonus (10%)
);
console.log(pricing);
// {
//   basePrice: "0.001",
//   adjustedPrice: "0.001650",
//   reputationMultiplier: 1.5,  // 50% premium for elite agents
//   domainBonus: 0.10
// }

// Calculate batch discount
const batch = calculateBatchDiscount('0.001', 50);
console.log(batch);
// {
//   totalPrice: "0.040000",   // 50 items
//   perItemPrice: "0.000800", // 20% discount per item
//   discountPercentage: 20
// }

// Calculate royalty for contributor
const royalty = calculateRoyalty('0.01', 0.75); // $0.01 query, 0.75 reputation
console.log(royalty);
// {
//   royaltyAmount: "0.002500", // 25% royalty
//   royaltyRate: 0.25,
//   netPrice: "0.007500"       // Remaining for protocol
// }

// Select optimal chain based on amount
const chainSelection = selectOptimalChain('0.005', 45); // $0.005, 45 gwei
console.log(chainSelection);
// {
//   preferredChain: "solana",
//   reason: "Amount $0.005 < $0.01 (Solana preferred for micro-transactions)"
// }

// Calculate collective query with royalty distribution
const collectiveQuery = calculateCollectiveQueryPrice(
  0.65,                  // querier reputation
  3,                     // 3 contributors
  [0.80, 0.65, 0.50]    // contributor reputations
);
console.log(collectiveQuery);
// {
//   basePrice: "0.01",
//   adjustedPrice: "0.012000",
//   royaltyDistribution: [
//     { contributorIndex: 0, reputationScore: 0.80, royaltyAmount: "0.003000", royaltyRate: 0.25 },
//     { contributorIndex: 1, reputationScore: 0.65, royaltyAmount: "0.003000", royaltyRate: 0.25 },
//     { contributorIndex: 2, reputationScore: 0.50, royaltyAmount: "0.002400", royaltyRate: 0.20 }
//   ],
//   protocolRevenue: "0.003600"
// }

// Get pricing summary
const summary = getPricingSummary('MEMORY_STORE', 0.85, {
  batchSize: 50,
  networkId: 'base',
  domainBonus: 0.10,
});
console.log(summary);
// {
//   operation: "MEMORY_STORE",
//   basePrice: "0.001",
//   adjustments: [
//     { type: "reputation", description: "Reputation multiplier (1.5x)", amount: "+$0.000500" },
//     { type: "domain", description: "Domain expertise bonus", amount: "+10%" },
//     { type: "batch", description: "Batch discount (20%)", amount: "-20%" }
//   ],
//   finalPrice: "0.040000"
// }
```

### Receipt Management

```typescript
import {
  generateReceipt,
  verifyReceiptChecksum,
  batchReceiptsForAnchoring,
  verifyMerkleProof,
  getReceiptSummary,
} from '@xache/common';

// Generate receipt
const receipt = generateReceipt({
  agentId: 'did:agent:evm:0x742d35...',
  operationType: 'memory_store',
  operationId: 'mem_abc123',
  amountPaid: '0.001500',
  networkId: 'base',
  txHash: '0xabcdef...',
  metadata: {
    storageKey: 'key_xyz',
    tier: 'hot',
  },
});

console.log(receipt.receiptId); // "rcpt_1706543210_a8b9c7d2"

// Verify receipt checksum
const isValid = verifyReceiptChecksum(receipt);
console.log(isValid); // true

// Batch receipts for blockchain anchoring
const receipts = [receipt1, receipt2, receipt3];
const { merkleRoot, proofs } = batchReceiptsForAnchoring(receipts);

console.log(merkleRoot); // "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9"
console.log(proofs.length); // 3

// Verify Merkle proof
const isProofValid = verifyMerkleProof(
  receipt.checksum,
  proofs[0]
);
console.log(isProofValid); // true

// Get receipt summary
const summary = getReceiptSummary(receipt);
console.log(summary);
// {
//   id: "rcpt_1706543210_a8b9c7d2",
//   operation: "memory_store",
//   amount: "0.001500",
//   network: "base",
//   timestamp: "2025-01-29T12:00:10.000Z",
//   verified: false,
//   anchored: false
// }
```

## API Reference

### Reputation Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `calculateReputationScore(metrics)` | Calculate overall score from metrics | `number` (0.0-1.0) |
| `updateReputationScores(current, success, responseTime)` | Update after operation | `ReputationScores` |
| `calculateReputationDecay(score, daysInactive)` | Calculate decay from inactivity | `number` |
| `calculateContributionBoost(score, valueUSD)` | Calculate boost from contribution | `number` |
| `getReputationStatus(score)` | Get tier and status info | `object` |

### Budget Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `calculateBudgetStatus(spent, limit)` | Get current budget status | `BudgetStatus` |
| `shouldThrottle(spent, limit)` | Check if should auto-throttle | `boolean` |
| `shouldBlockOperation(spent, cost, limit)` | Check if should block | `boolean` |
| `updateBudget(current, cost)` | Update after operation | `BudgetControls` |
| `getBudgetRecommendations(spent, limit, days)` | Get recommendations | `object` |

### Pricing Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `calculateOperationPrice(op, rep, bonus?)` | Calculate dynamic price | `object` |
| `calculateBatchDiscount(price, size)` | Calculate batch pricing | `object` |
| `calculateRoyalty(price, rep)` | Calculate royalty payment | `object` |
| `selectOptimalChain(amount, gasGwei?)` | Select base or solana | `object` |
| `getPricingSummary(op, rep, options?)` | Get detailed pricing | `object` |

### Receipt Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `generateReceipt(params)` | Generate new receipt | `Receipt` |
| `verifyReceiptChecksum(receipt)` | Verify integrity | `boolean` |
| `batchReceiptsForAnchoring(receipts)` | Batch for blockchain | `object` |
| `verifyMerkleProof(checksum, proof)` | Verify Merkle proof | `boolean` |
| `getReceiptSummary(receipt)` | Get summary | `object` |

## Business Logic Rules

### Reputation Scoring
- **Minimum operations**: 10 operations required to establish reputation
- **Success rate weight**: 40% of score
- **Contribution value weight**: 30% of score
- **Response time weight**: 20% of score
- **Activity consistency weight**: 10% of score
- **Decay rate**: 0.1% per day of inactivity
- **Max decay**: Reset to 0 after 365 days inactivity

### Budget Enforcement
- **Default monthly limit**: $25.00
- **Warning thresholds**: 50%, 80%, 100%
- **Auto-throttle threshold**: 90%
- **Grace overage**: $1.00 beyond limit
- **Monthly reset**: Automatic on new month

### Pricing Rules
- **Reputation multipliers**: 0.5x (new) to 1.5x (elite)
- **Batch discount**: 20% for batch operations
- **Royalty rates**: 10% (new) to 30% (elite) for contributors
- **Domain bonus**: Up to 20% for expertise
- **Chain selection**: Solana for < $0.01, Base for >= $0.01

### Receipt Anchoring
- **Batching**: Multiple receipts combined in Merkle tree
- **Blockchain**: Merkle root anchored to Base/Solana
- **Verification**: Merkle proof validates inclusion
- **Checksum**: CRC32C for data integrity

## License

MIT

## References

- PRD: Product Requirements Document (v5)
- HLD: High-Level Design (v5)
- LLD: Low-Level Design (v5)
- @xache/types: Type definitions
- @xache/constants: Configuration constants
- @xache/utils: Common utilities
- @xache/crypto: Cryptographic functions
