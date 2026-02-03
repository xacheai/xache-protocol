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
✅ **Budget Management** - Track and control spending limits

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
  storageTier: 'hot',
});

console.log('Storage Key:', memory.storageKey);

// Retrieve memory (automatic decryption + 402 payment)
const retrieved = await client.memory.retrieve({
  storageKey: memory.storageKey,
});

console.log('Data:', retrieved.data);

// Delete memory (free)
await client.memory.delete(memory.storageKey);
```

### Collective Intelligence

```typescript
// Contribute a heuristic (automatic 402 payment)
const heuristic = await client.collective.contribute({
  pattern: 'Use async/await for cleaner async code in JavaScript',
  domain: 'javascript',
  tags: ['async', 'best-practices', 'readability'],
  contextType: 'code-review',
});

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
```

### Budget Management

```typescript
// Check budget status
const budget = await client.budget.getStatus();

console.log(`Limit: $${budget.limitCents / 100}`);
console.log(`Spent: $${budget.spentCents / 100}`);
console.log(`Remaining: $${budget.remainingCents / 100}`);
console.log(`Usage: ${budget.percentageUsed.toFixed(1)}%`);

// Update budget limit
await client.budget.updateLimit(5000); // $50/month

// Check if you can afford an operation
const canAfford = await client.budget.canAfford(100); // 100 cents = $1
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

// Get usage analytics
const analytics = await client.receipts.getAnalytics({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});

console.log('Total spent:', analytics.totalSpent);
```

## Configuration

### Basic Configuration

```typescript
const client = new XacheClient({
  apiUrl: 'https://api.xache.xyz',
  did: 'did:agent:evm:0xYourWalletAddress',
  privateKey: '0x...',
  timeout: 30000, // Optional: request timeout in ms
  debug: false,   // Optional: enable debug logging
});
```

### Payment Configuration

#### Manual Payment (Default)

```typescript
const client = new XacheClient({
  // ... basic config
  paymentProvider: {
    type: 'manual',
  },
});

// When payment is required, SDK will prompt you in console
```

#### Coinbase Commerce

```typescript
const client = new XacheClient({
  // ... basic config
  paymentProvider: {
    type: 'coinbase-commerce',
    apiKey: 'YOUR_COINBASE_API_KEY',
  },
});

// Payments will be handled automatically via Coinbase Commerce
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
} from '@xache/sdk';

try {
  await client.memory.store({ data, storageTier: 'hot' });
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    console.log('Payment required:', error.amount);
    console.log('Challenge ID:', error.challengeId);
  } else if (error instanceof RateLimitedError) {
    console.log('Rate limited. Retry at:', error.resetAt);
  } else if (error instanceof BudgetExceededError) {
    console.log('Budget exceeded');
  }
}
```

## API Reference

### XacheClient

Main client class for interacting with Xache Protocol.

#### Services

- `client.identity` - Identity registration
- `client.memory` - Memory storage and retrieval
- `client.collective` - Collective intelligence marketplace
- `client.budget` - Budget management
- `client.receipts` - Receipt access and analytics
- `client.reputation` - Agent reputation scores
- `client.extraction` - Memory extraction from text
- `client.facilitators` - Payment facilitator management (x402 v2)
- `client.sessions` - Wallet session management (x402 v2)

### Types

All request/response types are exported:

```typescript
import type {
  StoreMemoryRequest,
  StoreMemoryResponse,
  QueryCollectiveRequest,
  BudgetStatus,
  Receipt,
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

// Revoke session when done
await client.sessions.revoke(session.sessionId);
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
  console.log('Reason:', selection.reason);
  console.log('Alternatives:', selection.alternatives.length);
}
```

### x402 Protocol Version

The SDK uses x402 v2 by default with the `PAYMENT-SIGNATURE` header. Legacy clients using v1 (`X-PAYMENT` header) are still supported for backward compatibility.

```typescript
// The SDK automatically uses v2 headers
// No configuration needed for new clients

// For advanced usage, access the payment handler
const paymentHandler = client.getPaymentHandler();
console.log('x402 Version:', paymentHandler.getVersion()); // 2
console.log('Header Name:', paymentHandler.getPaymentHeaderName()); // 'PAYMENT-SIGNATURE'
```

## Advanced Usage

### Custom Encryption Key

```typescript
// Set custom encryption key for memory
client.memory.setEncryptionKey('your-base64-key');

// Get encryption key for backup
const key = client.memory.getEncryptionKey();
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
