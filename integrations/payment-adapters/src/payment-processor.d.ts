/**
 * Payment processor for Xache Protocol
 * Orchestrates payment flow: challenge → verification → settlement → receipt
 */
import { CDPFacilitatorClient } from './cdp-facilitator';
import { type LegacyReceipt } from '@xache/common';
import { OPERATION_PRICES } from '@xache/constants';
import type { PaymentRequirements, NetworkId } from '@xache/types';
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
    /** Transaction hash (provided by agent after payment) */
    txHash?: string;
}
/**
 * Payment processor
 */
export declare class PaymentProcessor {
    private config;
    private logger;
    constructor(config: PaymentProcessorConfig);
    /**
     * Step 1: Generate payment challenge (402 Payment Required)
     */
    createPaymentChallenge(request: PaymentRequest): Promise<PaymentRequirements>;
    /**
     * Step 2: Verify payment (agent provides transaction hash)
     */
    verifyPayment(request: PaymentRequest): Promise<PaymentResponse>;
    /**
     * Step 3: Settle batch of payments (background job)
     */
    settleBatch(receipts: LegacyReceipt[]): Promise<{
        success: boolean;
        settlementTxHash?: string;
        error?: string;
    }>;
    /**
     * Process complete payment flow
     * 1. Generate challenge
     * 2. Agent pays
     * 3. Verify payment
     * 4. Return success (settlement happens async)
     */
    processPayment(request: PaymentRequest): Promise<PaymentResponse>;
    /**
     * Get circuit breaker status
     */
    getStatus(): {
        circuitBreaker: string;
        optimistic: boolean;
    };
}
/**
 * Create payment processor from environment
 */
export declare function createPaymentProcessor(facilitator: CDPFacilitatorClient): PaymentProcessor;
//# sourceMappingURL=payment-processor.d.ts.map