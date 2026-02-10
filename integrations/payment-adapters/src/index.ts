/**
 * @xache/payment-adapters
 *
 * Server-side payment integration for Xache Protocol API Gateway.
 *
 * This package is for SERVER-SIDE use only. It provides:
 * - CDP Facilitator client for settling x402 payments
 * - Payment processor for API Gateway payment handling
 * - Facilitator registry for multi-facilitator support
 *
 * IMPORTANT: For CLIENT-SIDE payments (agent SDKs), use @xache/sdk instead.
 * The SDK (@xache/sdk) has full support for:
 * - EVM chains (Base, Base Sepolia) via ERC-3009 gasless transfers
 * - Solana chains (Devnet, Mainnet) via SPL token transfers
 * - Automatic x402 payment handling with CDP
 *
 * This package does NOT implement client-side Solana payments because:
 * 1. Client-side payments are handled by @xache/sdk's SolanaPaymentHandler
 * 2. Server-side CDP integration uses the CDP API which handles both chains
 * 3. The facilitator (CDP) executes the actual on-chain settlement
 *
 * @example Server-side usage (API Gateway):
 * ```typescript
 * import { CDPFacilitatorClient, PaymentProcessor } from '@xache/payment-adapters';
 *
 * const cdp = createCDPFacilitatorFromEnv();
 * const processor = createPaymentProcessor(cdp);
 *
 * // Verify and settle x402 payment
 * const result = await processor.processPayment(x402Header, paymentRequirements);
 * ```
 *
 * @example Client-side usage (@xache/sdk - NOT this package):
 * ```typescript
 * import { XacheClient } from '@xache/sdk';
 *
 * const client = new XacheClient({
 *   apiUrl: 'https://api.xache.xyz',
 *   did: 'did:agent:sol:YOUR_ADDRESS',
 *   privateKey: 'YOUR_SOLANA_PRIVATE_KEY',
 * });
 *
 * // SDK automatically handles x402 payments for both EVM and Solana
 * await client.memory.store({ data: {...}, storageTier: 'hot' });
 * ```
 */

// CDP Facilitator Client
export {
  CDPFacilitatorClient,
  createCDPFacilitatorFromEnv,
  type CDPFacilitatorConfig,
} from './cdp-facilitator';

// Payment Processor
export {
  PaymentProcessor,
  createPaymentProcessor,
  type PaymentProcessorConfig,
  type PaymentRequest,
} from './payment-processor';

// Facilitator Registry (x402 v2 Multi-Facilitator Support)
export {
  FacilitatorRegistry,
  facilitatorRegistry,
  registerDefaultFacilitators,
  type HealthCheckResult,
} from './facilitator-registry';
