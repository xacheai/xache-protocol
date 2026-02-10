/**
 * Payment processor for Xache Protocol
 * Orchestrates payment flow: challenge → verification → settlement → receipt
 */

import { CDPFacilitatorClient } from './cdp-facilitator';
import { generateReceipt, type LegacyReceipt } from '@xache/common';
import { createLogger } from '@xache/utils';
import {
  PAYMENT_TIMEOUTS,
  OPERATION_PRICES,
  usdToAtomicUnits,
} from '@xache/constants';
import type {
  PaymentRequirements,
  NetworkId,
} from '@xache/types';

/**
 * Payment response
 */
export interface PaymentResponse {
  success: boolean;
  verified?: boolean;
  paymentRequired?: boolean;
  requirements?: PaymentRequirements;
  error?: string;
  txHash?: string;
  receipt?: LegacyReceipt;
  verificationTime?: number;
}

/**
 * Payment processor configuration
 */
export interface PaymentProcessorConfig {
  /** CDP facilitator client */
  facilitator: CDPFacilitatorClient;
  /** Protocol wallet address (receives payments) */
  protocolWalletAddress: string;
  /** Enable optimistic verification (return success before blockchain confirmation) */
  optimistic?: boolean;
}

/**
 * ERC-3009 authorization (for EVM networks)
 */
export interface ERC3009AuthorizationPayload {
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
  };
  signature: string;
}

/**
 * Solana transaction payload (for Solana networks)
 */
export interface SolanaTransactionPayload {
  transaction: string; // Partially signed transaction
  signers: string[]; // Public keys that have signed
}

/**
 * Payment request
 */
export interface PaymentRequest {
  /** Agent DID making payment */
  agentId: string;
  /** Operation type */
  operationType: keyof typeof OPERATION_PRICES | string;
  /** Operation ID for tracking */
  operationId: string;
  /** Amount in USD */
  amountUSD: string;
  /** Preferred network */
  network: NetworkId;
  /** Resource URL being accessed (e.g., "https://api.xache.xyz/v1/memory/store") */
  resource: string;
  /** ERC-3009 authorization (for EVM networks) */
  erc3009Authorization?: ERC3009AuthorizationPayload;
  /** Solana transaction (for Solana networks) */
  solanaTransaction?: SolanaTransactionPayload;
}

/**
 * Payment processor
 */
export class PaymentProcessor {
  private config: Required<PaymentProcessorConfig>;
  private logger = createLogger({ service: 'payment-processor' });

  constructor(config: PaymentProcessorConfig) {
    this.config = {
      facilitator: config.facilitator,
      protocolWalletAddress: config.protocolWalletAddress,
      optimistic: config.optimistic ?? true,
    };
  }

  /**
   * Step 1: Generate payment challenge (402 Payment Required)
   */
  async createPaymentChallenge(
    request: PaymentRequest
  ): Promise<PaymentRequirements> {
    this.logger.debug('Creating payment challenge', {
      agentId: request.agentId,
      operation: request.operationType,
      amount: request.amountUSD,
    });

    const challenge = await this.config.facilitator.generatePaymentChallenge({
      amount: request.amountUSD,
      recipientAddress: this.config.protocolWalletAddress,
      network: request.network,
      resource: request.resource,
    });

    this.logger.info('Payment challenge created', {
      agentId: request.agentId,
      network: request.network,
      maxAmountRequired: challenge.maxAmountRequired,
    });

    return challenge;
  }

  /**
   * Step 2: Verify payment (agent provides ERC-3009 or Solana authorization)
   */
  async verifyPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Validate that payment authorization is provided
    const hasERC3009 = !!request.erc3009Authorization;
    const hasSolana = !!request.solanaTransaction;

    if (!hasERC3009 && !hasSolana) {
      throw new Error('Payment authorization required (erc3009Authorization for EVM or solanaTransaction for Solana)');
    }

    this.logger.debug('Verifying payment', {
      agentId: request.agentId,
      network: request.network,
      hasERC3009,
      hasSolana,
    });

    // Calculate expected amount in atomic units
    const atomicUnits = usdToAtomicUnits(request.amountUSD);

    // Get USDC address for network
    const { getUSDCAddress } = await import('@xache/constants');
    const usdcAddress = getUSDCAddress(request.network);

    // Verify with CDP facilitator (optimistic: 500ms timeout)
    const startTime = Date.now();

    // Build payment payload based on network type
    let paymentPayload: any;

    if (hasERC3009) {
      // ERC-3009 authorization for EVM networks (x402.org format)
      this.logger.info('Using ERC-3009 authorization format', {
        network: request.network,
        from: request.erc3009Authorization!.authorization.from,
        to: request.erc3009Authorization!.authorization.to,
        value: request.erc3009Authorization!.authorization.value,
      });

      paymentPayload = {
        x402Version: 1,
        scheme: 'exact' as const,
        network: request.network,
        payload: {
          authorization: request.erc3009Authorization!.authorization,
          signature: request.erc3009Authorization!.signature,
        },
      };
    } else {
      // Solana partially-signed transaction
      this.logger.info('Using Solana transaction format', {
        network: request.network,
        signers: request.solanaTransaction!.signers,
      });

      paymentPayload = {
        x402Version: 1,
        scheme: 'exact' as const,
        network: request.network,
        payload: {
          transaction: request.solanaTransaction!.transaction,
          signers: request.solanaTransaction!.signers,
        },
      };
    }

    const paymentRequirements = {
      scheme: 'exact' as const,
      network: request.network,
      maxAmountRequired: atomicUnits,
      asset: usdcAddress,
      payTo: this.config.protocolWalletAddress,
      resource: '',
      description: request.operationType,
      mimeType: 'application/json',
      maxTimeoutSeconds: 120,
    };

    // Extract x402Version from paymentPayload
    const x402Version = paymentPayload.x402Version || 1;

    const verification = await this.config.facilitator.verifyPayment({
      x402Version,
      paymentPayload,
      paymentRequirements,
    });

    const verificationTime = Date.now() - startTime;

    if (!verification.verified) {
      this.logger.warn('Payment verification failed', {
        txHash: verification.txHash,
        error: verification.error,
        verificationTime,
      });

      return {
        success: false,
        verified: false,
        txHash: verification.txHash,
        error: verification.error || 'Payment verification failed',
        verificationTime,
      };
    }

    // Generate receipt
    const receipt = generateReceipt({
      agentId: request.agentId,
      operationType: request.operationType,
      operationId: request.operationId,
      amountPaid: request.amountUSD,
      networkId: request.network,
      txHash: verification.txHash,
      metadata: {
        verificationTime,
        optimistic: this.config.optimistic,
      },
    });

    this.logger.info('Payment verified', {
      agentId: request.agentId,
      txHash: verification.txHash,
      receiptId: receipt.receiptId,
      verificationTime,
    });

    // In optimistic mode, return success immediately
    // Settlement happens in background
    return {
      success: true,
      verified: true,
      txHash: verification.txHash,
      receipt,
      verificationTime,
    };
  }

  /**
   * Step 3: Settle batch of payments (background job)
   */
  async settleBatch(receipts: LegacyReceipt[]): Promise<{
    success: boolean;
    settlementTxHash?: string;
    error?: string;
  }> {
    if (receipts.length === 0) {
      return { success: true };
    }

    this.logger.debug('Settling payment batch', {
      receiptCount: receipts.length,
    });

    // Group receipts by network
    const { groupReceiptsByNetwork } = await import('@xache/common');
    const receiptsByNetwork = groupReceiptsByNetwork(receipts);

    const results: Array<{
      network: NetworkId;
      success: boolean;
      error?: string;
    }> = [];

    // Settle each network separately
    for (const [network, networkReceipts] of Object.entries(receiptsByNetwork)) {
      const settlementRequest = {
        network: network as NetworkId,
        receipts: networkReceipts.map(r => ({
          txHash: r.txHash || '',
          amount: r.amountPaid,
        })),
      };

      const result = await this.config.facilitator.settleBatch(settlementRequest);

      results.push({
        network: network as NetworkId,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        this.logger.info('Batch settled successfully', {
          network,
          receiptCount: networkReceipts.length,
          settlementTxHash: result.settlementTxHash,
        });
      } else {
        this.logger.error('Batch settlement failed', new Error(result.error), {
          network,
          receiptCount: networkReceipts.length,
        });
      }
    }

    // Check if all settlements succeeded
    const allSuccess = results.every(r => r.success);

    return {
      success: allSuccess,
      error: allSuccess
        ? undefined
        : results.filter(r => !r.success).map(r => r.error).join('; '),
    };
  }

  /**
   * Process complete payment flow
   * 1. Generate challenge
   * 2. Agent pays
   * 3. Verify payment
   * 4. Return success (settlement happens async)
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // If no authorization provided, return payment challenge
    if (!request.erc3009Authorization && !request.solanaTransaction) {
      const challenge = await this.createPaymentChallenge(request);

      return {
        success: false,
        verified: false,
        paymentRequired: true,
        requirements: challenge,
      };
    }

    // If authorization provided, verify payment
    return await this.verifyPayment(request);
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    circuitBreaker: string;
    optimistic: boolean;
  } {
    return {
      circuitBreaker: this.config.facilitator.getCircuitBreakerStatus(),
      optimistic: this.config.optimistic,
    };
  }
}

/**
 * Create payment processor from environment
 */
export function createPaymentProcessor(
  facilitator: CDPFacilitatorClient
): PaymentProcessor {
  const protocolWalletAddress = process.env.PROTOCOL_WALLET_ADDRESS;

  if (!protocolWalletAddress) {
    throw new Error('PROTOCOL_WALLET_ADDRESS environment variable required');
  }

  return new PaymentProcessor({
    facilitator,
    protocolWalletAddress,
    optimistic: true,
  });
}
