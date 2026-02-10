# @xache/payment-adapters

CDP x402 payment integration for Xache Protocol - facilitator client and payment processor.

## Overview

Production-ready payment adapters:
- **CDP Facilitator Client**: Integrate with Coinbase x402 facilitator
- **Payment Processor**: Complete payment flow (challenge → verify → settle → receipt)
- **Circuit Breaker**: Prevent cascading failures
- **Optimistic Verification**: 500ms verification with async settlement

## Installation

```bash
npm install @xache/payment-adapters
```

## Prerequisites

### CDP API Keys

1. Go to [cdp.coinbase.com](https://cdp.coinbase.com)
2. Navigate to **Access → API Keys**
3. Create API Key and download JSON file
4. Extract `name` (API Key ID) and `privateKey` (EC Private Key)

### Environment Variables

```bash
# Required
CDP_API_KEY_ID="organizations/{org_id}/apiKeys/{key_id}"
CDP_API_KEY_SECRET="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----\n"
PROTOCOL_WALLET_ADDRESS="0x..." # Your protocol's wallet address

# Optional
NODE_ENV="production" # Set to "development" for testnet
```

## Usage

### Initialize CDP Facilitator

```typescript
import {
  CDPFacilitatorClient,
  createCDPFacilitatorFromEnv,
} from '@xache/payment-adapters';

// Option 1: From environment variables (recommended)
const facilitator = createCDPFacilitatorFromEnv();

// Option 2: Manual configuration
const facilitator = new CDPFacilitatorClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  testnet: false, // Use testnet (https://x402.org/facilitator)
});
```

### Initialize Payment Processor

```typescript
import {
  PaymentProcessor,
  createPaymentProcessor,
} from '@xache/payment-adapters';

// Create processor
const processor = createPaymentProcessor(facilitator);
```

### Complete Payment Flow

```typescript
// Step 1: Agent requests operation without payment
const paymentRequest = {
  agentId: 'did:agent:evm:0x742d35...',
  operationType: 'memory_store',
  operationId: 'mem_abc123',
  amountUSD: '0.001500', // $0.001500
  network: 'base' as NetworkId,
};

// Generate payment challenge (402 Payment Required)
const response1 = await processor.processPayment(paymentRequest);

if (response1.paymentRequired) {
  console.log('Payment required:', response1.requirements);
  // {
  //   scheme: 'exact',
  //   network: 'base',
  //   maxAmountRequired: '1500', // atomic units
  //   payTo: '0x...',
  //   asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC Base
  // }

  // Return to agent: HTTP 402 Payment Required
  // Agent pays using EIP-3009 transferWithAuthorization
}

// Step 2: Agent provides transaction hash after payment
paymentRequest.txHash = '0xabcdef123456...';
const response2 = await processor.processPayment(paymentRequest);

if (response2.success) {
  console.log('Payment verified!');
  console.log('Receipt ID:', response2.receipt?.receiptId);
  console.log('Verification time:', response2.verificationTime, 'ms');

  // Proceed with operation
  // Settlement happens asynchronously in background
}
```

### Manual Payment Steps

```typescript
import {
  CDPFacilitatorClient,
  PaymentProcessor,
} from '@xache/payment-adapters';

const facilitator = createCDPFacilitatorFromEnv();
const processor = new PaymentProcessor({
  facilitator,
  protocolWalletAddress: '0x...',
  optimistic: true, // Return success before blockchain confirmation
});

// Step 1: Generate payment challenge
const challenge = await processor.createPaymentChallenge({
  agentId: 'did:agent:evm:0x...',
  operationType: 'memory_store',
  operationId: 'mem_123',
  amountUSD: '0.001',
  network: 'base',
});

console.log('Pay to:', challenge.payTo);
console.log('Amount:', challenge.maxAmountRequired, 'atomic units');

// Step 2: Verify payment (after agent pays)
const verification = await processor.verifyPayment({
  agentId: 'did:agent:evm:0x...',
  operationType: 'memory_store',
  operationId: 'mem_123',
  amountUSD: '0.001',
  network: 'base',
  txHash: '0xabcdef...',
});

if (verification.success) {
  console.log('Payment verified!');
  console.log('Receipt:', verification.receipt);
}
```

### Batch Settlement (Background Job)

```typescript
// Background job that runs every 5 minutes
import { generateReceipt } from '@xache/common';

// Collect pending receipts from database
const pendingReceipts = await db.getUnsettledReceipts();

// Settle batch
const result = await processor.settleBatch(pendingReceipts);

if (result.success) {
  console.log('Batch settled:', result.settlementTxHash);
  // Update receipts in database as settled
} else {
  console.error('Settlement failed:', result.error);
  // Retry later
}
```

### Direct Facilitator Operations

```typescript
const facilitator = createCDPFacilitatorFromEnv();

// Generate payment challenge
const challenge = await facilitator.generatePaymentChallenge({
  amount: '0.001',
  recipientAddress: '0x...',
  network: 'base',
});

// Verify payment
const verification = await facilitator.verifyPayment({
  network: 'base',
  txHash: '0xabcdef...',
  expectedAmount: '1000', // atomic units
  expectedRecipient: '0x...',
  expectedToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
});

console.log('Verified:', verification.verified);

// Settle batch
const settlement = await facilitator.settleBatch({
  network: 'base',
  receipts: [
    { txHash: '0xabc...', amount: '1000' },
    { txHash: '0xdef...', amount: '2000' },
  ],
});

console.log('Settlement tx:', settlement.settlementTxHash);
```

### Circuit Breaker

```typescript
// Check circuit breaker status
const status = processor.getStatus();
console.log('Circuit breaker:', status.circuitBreaker); // "CLOSED", "OPEN", "HALF_OPEN"

// Circuit breaker automatically:
// - Opens after 5 consecutive failures
// - Prevents requests when open (fail-fast)
// - Transitions to half-open after 60 seconds
// - Closes after 2 successful requests in half-open state

// Manual reset (if needed)
facilitator.resetCircuitBreaker();
```

### Supported Networks

```typescript
const networks = await facilitator.getSupportedNetworks();
console.log(networks); // ["base", "solana"] or ["base-sepolia", "solana-devnet"]
```

## Payment Flow

### HTTP 402 Flow

```
1. Agent requests operation (no payment)
   → Server returns 402 Payment Required + payment challenge

2. Agent signs EIP-3009 authorization (off-chain)
   → Agent calls USDC transferWithAuthorization (on-chain)
   → Agent gets txHash

3. Agent retries operation with txHash in header
   → Server verifies payment (500ms optimistic)
   → Server returns 200 OK + receipt
   → Operation proceeds

4. Background settlement (every 5 minutes)
   → Server batches receipts
   → Server calls /settle endpoint
   → Funds move to protocol wallet
```

### Optimistic Verification

- **Timeout**: 500ms for verification
- **Verification**: CDP facilitator checks transaction validity
- **Success**: Return immediately (don't wait for blockchain confirmation)
- **Settlement**: Happens asynchronously in background job
- **Benefit**: Fast response time, better UX

## Configuration

### Testnet vs Production

```typescript
// Testnet (Base Sepolia + Solana Devnet)
const facilitator = new CDPFacilitatorClient({
  apiKeyId: 'test-key',
  apiKeySecret: 'test-secret',
  testnet: true, // Uses https://x402.org/facilitator
});

// Production (Base Mainnet + Solana Mainnet)
const facilitator = new CDPFacilitatorClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  testnet: false, // Uses https://api.developer.coinbase.com/x402
});
```

### Custom Facilitator URL

```typescript
const facilitator = new CDPFacilitatorClient({
  apiKeyId: '...',
  apiKeySecret: '...',
  facilitatorUrl: 'https://custom-facilitator.com', // Override default
});
```

## Error Handling

```typescript
try {
  const verification = await processor.verifyPayment(request);

  if (!verification.success) {
    // Payment verification failed
    console.error('Verification error:', verification.error);

    // Possible errors:
    // - "Transaction not found"
    // - "Insufficient amount paid"
    // - "Wrong recipient"
    // - "Wrong token"
    // - "Transaction reverted"
  }
} catch (error) {
  // Circuit breaker open or network error
  console.error('Payment system unavailable:', error.message);

  // Return 503 Service Unavailable to agent
  // Retry later
}
```

## Performance

| Operation | Typical Time | Timeout |
|-----------|--------------|---------|
| Generate challenge | <10ms | 500ms |
| Verify payment (optimistic) | 50-200ms | 500ms |
| Verify payment (full) | 1-5s | 2s |
| Settle batch | 100-500ms | 60s |

## Security

- **JWT Authentication**: All CDP requests authenticated with ES256 JWT
- **API Key Storage**: Never commit keys to version control
- **Environment Variables**: Use secure secret management
- **Rate Limiting**: Implement client-side rate limits
- **Circuit Breaker**: Prevents cascading failures
- **Idempotency**: Safe to retry verification (same txHash)

## Limitations

- **Verification Timeout**: 500ms optimistic (may return before blockchain confirmation)
- **Settlement Delay**: Batched every 5 minutes (configurable)
- **Rate Limits**: CDP rate limits apply (conservative: 100 req/sec)
- **Network Support**: Base and Solana only (via CDP)
- **Token**: USDC only (6 decimals)

## Testing

```typescript
// Use testnet for development
const facilitator = new CDPFacilitatorClient({
  apiKeyId: 'test',
  apiKeySecret: 'test',
  testnet: true,
});

// Test networks:
// - Base Sepolia (Chain ID: 84532)
// - Solana Devnet

// Get test USDC:
// - Base Sepolia: https://faucet.circle.com/
// - Solana Devnet: https://spl-token-faucet.com/
```

## References

- [x402 Protocol Specification](https://www.x402.org/)
- [CDP x402 Documentation](https://docs.cdp.coinbase.com/x402/)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [x402 GitHub Repository](https://github.com/coinbase/x402)
- x402-integration-answers-comprehensive.md: Implementation decisions

## License

MIT
