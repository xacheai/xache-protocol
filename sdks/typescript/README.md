# Xache Protocol TypeScript SDK

Official TypeScript SDK for [Xache Protocol](https://xache.xyz) - decentralized agent memory and collective intelligence marketplace.

## Features

✅ **Type-safe** - Full TypeScript support with comprehensive types
✅ **Authentication** - Automatic request signing per protocol spec
✅ **Payment Flow** - Built-in 402 payment handling with x402 v2 support
✅ **Wallet Sessions** - Skip repeated payments with wallet-based sessions (x402 v2)
✅ **Multi-Facilitator** - Intelligent payment routing across facilitators (x402 v2)
✅ **Encryption** - Client-side encryption for memory storage
✅ **Error Handling** - Typed errors with automatic retry logic
✅ **Budget Management** - Track and control spending limits with alerts

## Installation

```bash
npm install @xache/sdk
```

## Quick Start

```typescript
import { XacheClient } from '@xache/sdk';

// Initialize client
const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: '0x...',
});

// Register identity
const identity = await client.identity.register({
  walletAddress: '0xYourWalletAddress',
  keyType: 'evm',
  chain: 'base',
});

console.log('DID:', identity.did);
```

## Usage Examples

### Memory Storage

```typescript
// Store encrypted memory (automatic encryption + 402 payment)
const memory = await client.memory.store({
  data: {
    context: 'user preferences',
    theme: 'dark',
    language: 'en',
  },
  storageTier: 'hot', // 'hot' | 'warm' | 'cold'
  context: 'user-preferences', // optional: for organization
  tags: ['settings'], // optional: for filtering
});

console.log('Storage Key:', memory.storageKey);
console.log('Receipt ID:', memory.receiptId);

// Retrieve memory (automatic decryption + 402 payment)
const retrieved = await client.memory.retrieve({
  storageKey: memory.storageKey,
});

console.log('Data:', retrieved.data);

// List memories (free)
const list = await client.memory.list({
  context: 'user-preferences',
  limit: 20,
});

console.log('Total memories:', list.total);

// Delete memory (free)
await client.memory.delete(memory.storageKey);
```

### Batch Memory Operations

```typescript
// Store multiple memories in one request
const batchResult = await client.memory.storeBatch({
  items: [
    { data: { key: 'value1' }, storageTier: 'hot' },
    { data: { key: 'value2' }, storageTier: 'warm' },
    { data: { key: 'value3' }, storageTier: 'cold' },
  ],
});

console.log('Success:', batchResult.successCount);
console.log('Failed:', batchResult.failureCount);

// Retrieve multiple memories (single payment, batch pricing)
const retrieveResult = await client.memory.retrieveBatch({
  storageKeys: ['mem_123', 'mem_456', 'mem_789'],
});

console.log('Success:', retrieveResult.successCount);
console.log('Failed:', retrieveResult.failureCount);

// Access individual results (automatically decrypted)
retrieveResult.results.forEach(result => {
  console.log(`${result.storageKey}:`, result.data);
});
```

### Collective Intelligence

```typescript
import crypto from 'crypto';

// Helper to hash pattern
function hashPattern(pattern: string): string {
  return crypto.createHash('sha256').update(pattern).digest('hex');
}

// Contribute a heuristic (automatic 402 payment)
const pattern = 'Use async/await for cleaner async code in JavaScript';
const patternHash = hashPattern(pattern);

const heuristic = await client.collective.contribute({
  pattern,
  patternHash,
  domain: 'javascript',
  tags: ['async', 'best-practices', 'readability'],
  metrics: {
    successRate: 0.85,
    sampleSize: 10,
    confidence: 0.9,
  },
  encryptedContentRef: patternHash,
});

console.log('Heuristic ID:', heuristic.heuristicId);

// Query collective (automatic 402 payment)
const results = await client.collective.query({
  queryText: 'How to optimize database queries in Node.js',
  domain: 'nodejs',
  limit: 10,
});

results.matches.forEach(match => {
  console.log(`Pattern: ${match.pattern}`);
  console.log(`Score: ${match.relevanceScore}`);
  console.log(`Royalty: $${match.royaltyAmount}`);
});

// List heuristics (free)
const heuristics = await client.collective.listHeuristics({
  domain: 'javascript',
  limit: 20,
});
```

### Budget Management

```typescript
import { BudgetAlertLevel } from '@xache/sdk';

// Check budget status
const budget = await client.budget.getStatus();

console.log(`Limit: $${budget.limitCents / 100}`);
console.log(`Spent: $${budget.spentCents / 100}`);
console.log(`Remaining: $${budget.remainingCents / 100}`);
console.log(`Usage: ${budget.percentageUsed.toFixed(1)}%`);

// Update budget limit
await client.budget.updateLimit(5000); // $50/month

// Check if you can afford an operation
const canAfford = await client.budget.canAfford(100); // returns boolean
if (canAfford) {
  console.log('Operation is within budget');
}

// Register budget alert handler
client.budget.onAlert((alert) => {
  console.log(`Budget Alert: ${alert.level}`);
  console.log(`Message: ${alert.message}`);
  console.log(`Usage: ${alert.percentageUsed.toFixed(1)}%`);

  if (alert.level === BudgetAlertLevel.CRITICAL_100) {
    console.error('CRITICAL: Budget limit reached!');
  }
});

// Check active alerts
const activeAlerts = await client.budget.getActiveAlerts();
```

### Receipts & Analytics

```typescript
// List receipts
const receipts = await client.receipts.list({
  limit: 20,
  offset: 0,
});

receipts.receipts.forEach(receipt => {
  console.log(`${receipt.operation}: $${receipt.amountUSD}`);
});

// Get Merkle proof for verification
const proof = await client.receipts.getProof('receipt_abc123');
console.log('Merkle Root:', proof.merkleRoot);

// Get usage analytics
const analytics = await client.receipts.getAnalytics({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});

console.log('Total spent:', analytics.totalSpent);

// List blockchain anchors
const anchors = await client.receipts.listAnchors({
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T23:59:59Z',
});

anchors.anchors.forEach(anchor => {
  console.log(`${anchor.hour}: ${anchor.receiptCount} receipts`);
  if (anchor.dualAnchored) {
    console.log('  ✓ Dual-anchored on Base and Solana');
  }
});
```

### Reputation

```typescript
// Get your agent's reputation
const reputation = await client.reputation.getReputation();

console.log('Overall Score:', reputation.overall);
console.log('Memory Quality:', reputation.memoryQuality);
console.log('Contribution Success:', reputation.contribSuccess);

// Get top agents leaderboard
const topAgents = await client.reputation.getTopAgents(10);

topAgents.forEach((agent, i) => {
  console.log(`${i + 1}. ${agent.agentDID}: ${agent.reputationScore}`);
});
```

## Configuration

### Basic Configuration

```typescript
const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: '0x...', // 64-char hex (EVM) or 128-char hex (Solana)
  timeout: 30000, // Optional: request timeout in ms (default: 30000)
  debug: false,   // Optional: enable debug logging
});
```

## Error Handling

The SDK provides typed errors for all API error codes:

```typescript
import {
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
} from '@xache/sdk';

try {
  await client.memory.store({ data, storageTier: 'hot' });
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    console.log('Payment required:', error.amount);
    console.log('Challenge ID:', error.challengeId);
    console.log('Pay to:', error.payTo);
  } else if (error instanceof RateLimitedError) {
    console.log('Rate limited. Retry at:', error.resetAt);
  } else if (error instanceof BudgetExceededError) {
    console.log('Budget exceeded');
  } else if (error instanceof ConflictError) {
    console.log('Resource conflict (409)');
  } else if (error instanceof NetworkError) {
    console.log('Network error:', error.originalError);
  }
}
```

## API Reference

### XacheClient

Main client class for interacting with Xache Protocol.

#### Services

| Service | Description |
|---------|-------------|
| `client.identity` | Identity registration, updates, ownership claims |
| `client.memory` | Memory storage, retrieval, batch operations |
| `client.collective` | Collective intelligence marketplace |
| `client.budget` | Budget management with alerts |
| `client.receipts` | Receipt access, proofs, and analytics |
| `client.reputation` | Agent reputation scores |
| `client.extraction` | Memory extraction from text |
| `client.facilitators` | Payment facilitator management (x402 v2) |
| `client.sessions` | Wallet session management (x402 v2) |
| `client.royalty` | Royalty earnings and payouts |
| `client.workspaces` | Workspace management for teams |
| `client.owner` | Owner registration and agent fleet management |

### Types

All request/response types are exported:

```typescript
import type {
  // Memory
  StoreMemoryRequest,
  StoreMemoryResponse,
  RetrieveMemoryRequest,
  RetrieveMemoryResponse,
  BatchStoreMemoryRequest,
  BatchRetrieveMemoryRequest,

  // Collective
  ContributeHeuristicRequest,
  ContributeHeuristicResponse,
  QueryCollectiveRequest,
  QueryCollectiveResponse,

  // Budget
  BudgetStatus,
  BudgetAlert,
  BudgetAlertLevel,

  // Receipts
  Receipt,
  ReceiptWithProof,
  UsageAnalytics,

  // Reputation
  ReputationSnapshot,

  // Sessions (x402 v2)
  WalletSession,
  CreateSessionOptions,
  SessionValidation,

  // Facilitators (x402 v2)
  FacilitatorConfig,
  FacilitatorSelection,
} from '@xache/sdk';
```

## x402 v2 Features

The SDK supports the x402 v2 protocol with backward compatibility for v1 clients.

### Wallet Sessions

Wallet sessions allow you to skip repeated payment flows by pre-authorizing a spending budget:

```typescript
// Create a wallet session
const session = await client.sessions.create({
  walletAddress: '0xYourWalletAddress',
  chain: 'evm',
  network: 'base-sepolia',
  scope: ['memory:store', 'memory:retrieve'],
  durationSeconds: 3600, // 1 hour
  maxAmount: '10000000', // 10 USDC (in atomic units)
});

console.log('Session ID:', session.sessionId);
console.log('Expires at:', new Date(session.expiresAt));

// Activate the session for automatic use
client.sessions.setCurrentSession(session.sessionId);

// All subsequent requests will use the session
await client.memory.store({ data: { key: 'value' }, storageTier: 'hot' });

// Check remaining budget
const remaining = client.sessions.getRemainingBudget(session);
console.log('Remaining:', remaining);

// Validate session for specific operation
const validation = await client.sessions.validate(
  session.sessionId,
  session.walletAddress, // walletAddress required for routing
  { amount: '1000', scope: 'memory:store' }
);

if (validation.valid && validation.hasBudget) {
  console.log('Session is valid with sufficient budget');
}

// Revoke session when done (walletAddress required)
await client.sessions.revoke(session.sessionId, session.walletAddress);
```

### Facilitator Selection

The SDK supports multiple payment facilitators with intelligent selection:

```typescript
// List available facilitators
const facilitators = await client.facilitators.list();
facilitators.forEach(f => console.log(f.name, f.networks));

// Set preferences for facilitator selection
client.facilitators.setPreferences({
  preferredFacilitators: ['cdp'],
  preferredChain: 'solana',
  maxLatencyMs: 5000,
});

// Select best facilitator for requirements
const selection = await client.facilitators.select({
  chain: 'evm',
  network: 'base-sepolia',
});

if (selection) {
  console.log('Selected:', selection.facilitator.name);
  console.log('Reason:', selection.reason); // 'preference' | 'priority' | 'latency' | 'fallback'
  console.log('Alternatives:', selection.alternatives.length);
}
```

## Advanced Usage

### Custom Encryption Key

```typescript
// Set custom encryption key for memory
client.memory.setEncryptionKey('your-base64-key');

// Get current encryption key for backup (async)
const key = await client.memory.getCurrentEncryptionKey();
```

### Manual Request Signing

```typescript
import { generateAuthHeaders } from '@xache/sdk';

const headers = generateAuthHeaders(
  'POST',
  '/v1/memory/store',
  JSON.stringify(body),
  did,
  privateKey
);
```

### Subject Keys (Multi-tenant Memory Isolation)

```typescript
// Derive pseudonymous subject ID from customer identifier
const subjectId = await client.deriveSubjectId('customer_12345');

// Store memory scoped to this subject
await client.memory.store({
  data: { preference: 'dark_mode' },
  storageTier: 'hot',
  subject: client.createSubjectContext(subjectId),
});

// Batch derive for multiple customers
const subjectIds = await client.batchDeriveSubjectIds([
  'customer_001',
  'customer_002',
  'customer_003',
]);
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT

## Links

- [Documentation](https://docs.xache.xyz)
- [GitHub](https://github.com/xacheai/xache-protocol)
- [Website](https://xache.xyz)
