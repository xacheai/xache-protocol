/**
 * CDP x402 Facilitator Client for Xache Protocol
 * Based on x402-integration-answers-comprehensive.md and CDP documentation
 */
import type { PaymentRequirements, NetworkId } from '@xache/types';
/**
 * CDP Facilitator configuration
 */
export interface CDPFacilitatorConfig {
    /** CDP API Key ID (e.g., organizations/{org_id}/apiKeys/{key_id}) */
    apiKeyId: string;
    /** CDP API Key Secret (EC Private Key) */
    apiKeySecret: string;
    /** Facilitator URL (default: CDP production) */
    facilitatorUrl?: string;
    /** Enable testnet mode */
    testnet?: boolean;
}
/**
 * Payment verification request
 */
interface VerifyRequest {
    /** Network ID */
    network: NetworkId;
    /** Transaction hash */
    txHash: string;
    /** Expected amount in atomic units */
    expectedAmount: string;
    /** Expected recipient address */
    expectedRecipient: string;
    /** Expected token address */
    expectedToken: string;
}
/**
 * Payment verification response
 */
interface VerifyResponse {
    /** Verification status */
    verified: boolean;
    /** Transaction hash */
    txHash: string;
    /** Actual amount paid */
    amount: string;
    /** Sender address */
    from: string;
    /** Recipient address */
    to: string;
    /** Token address */
    token: string;
    /** Error message if verification failed */
    error?: string;
}
/**
 * Settlement request
 */
interface SettleRequest {
    /** Network ID */
    network: NetworkId;
    /** Payment receipts to settle */
    receipts: Array<{
        txHash: string;
        amount: string;
    }>;
}
/**
 * Settlement response
 */
interface SettleResponse {
    /** Settlement status */
    success: boolean;
    /** Settlement transaction hash */
    settlementTxHash?: string;
    /** Error message if settlement failed */
    error?: string;
}
/**
 * CDP x402 Facilitator Client
 */
export declare class CDPFacilitatorClient {
    private config;
    private logger;
    private circuitBreaker;
    constructor(config: CDPFacilitatorConfig);
    /**
     * Generate x402 payment requirements
     */
    generatePaymentChallenge(params: {
        amount: string;
        recipientAddress: string;
        network: NetworkId;
    }): Promise<PaymentRequirements>;
    /**
     * Verify payment with optimistic timeout (500ms)
     */
    verifyPayment(request: VerifyRequest): Promise<VerifyResponse>;
    /**
     * Internal verification with retry
     */
    private verifyPaymentInternal;
    /**
     * Settle payments asynchronously
     */
    settleBatch(request: SettleRequest): Promise<SettleResponse>;
    /**
     * Internal settlement with retry
     */
    private settleBatchInternal;
    /**
     * Settle single payment on-chain (x402 PaymentFacilitator interface)
     * Implements the PaymentFacilitator.settle() method per x402 spec
     *
     * @param request Settlement request with payment payload and requirements
     * @returns Settlement response with transaction hash
     */
    settle(request: any): Promise<any>;
    /**
     * Get supported networks from facilitator
     */
    getSupportedNetworks(): Promise<NetworkId[]>;
    /**
     * Generate JWT for CDP authentication
     * Uses ES256 algorithm with CDP API private key
     * Based on x402-integration-answers Q2
     */
    private generateJWT;
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(): string;
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(): void;
}
/**
 * Create CDP facilitator client from environment variables
 */
export declare function createCDPFacilitatorFromEnv(): CDPFacilitatorClient;
export {};
//# sourceMappingURL=cdp-facilitator.d.ts.map