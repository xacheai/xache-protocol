/**
 * Payment processor for Xache Protocol
 * Orchestrates payment flow: challenge → verification → settlement → receipt
 */
import { generateReceipt } from '@xache/common';
import { createLogger } from '@xache/utils';
import { usdToAtomicUnits, } from '@xache/constants';
/**
 * Payment processor
 */
export class PaymentProcessor {
    config;
    logger = createLogger({ service: 'payment-processor' });
    constructor(config) {
        this.config = {
            facilitator: config.facilitator,
            protocolWalletAddress: config.protocolWalletAddress,
            optimistic: config.optimistic ?? true,
        };
    }
    /**
     * Step 1: Generate payment challenge (402 Payment Required)
     */
    async createPaymentChallenge(request) {
        this.logger.debug('Creating payment challenge', {
            agentId: request.agentId,
            operation: request.operationType,
            amount: request.amountUSD,
        });
        const challenge = await this.config.facilitator.generatePaymentChallenge({
            amount: request.amountUSD,
            recipientAddress: this.config.protocolWalletAddress,
            network: request.network,
        });
        this.logger.info('Payment challenge created', {
            agentId: request.agentId,
            network: request.network,
            maxAmountRequired: challenge.maxAmountRequired,
        });
        return challenge;
    }
    /**
     * Step 2: Verify payment (agent provides transaction hash)
     */
    async verifyPayment(request) {
        if (!request.txHash) {
            throw new Error('Transaction hash required for payment verification');
        }
        this.logger.debug('Verifying payment', {
            agentId: request.agentId,
            txHash: request.txHash,
            network: request.network,
        });
        // Calculate expected amount in atomic units
        const atomicUnits = usdToAtomicUnits(request.amountUSD);
        // Get USDC address for network
        const { getUSDCAddress } = await import('@xache/constants');
        const usdcAddress = getUSDCAddress(request.network);
        // Verify with CDP facilitator (optimistic: 500ms timeout)
        const startTime = Date.now();
        const verification = await this.config.facilitator.verifyPayment({
            network: request.network,
            txHash: request.txHash,
            expectedAmount: atomicUnits,
            expectedRecipient: this.config.protocolWalletAddress,
            expectedToken: usdcAddress,
        });
        const verificationTime = Date.now() - startTime;
        if (!verification.verified) {
            this.logger.warn('Payment verification failed', {
                txHash: request.txHash,
                error: verification.error,
                verificationTime,
            });
            return {
                success: false,
                verified: false,
                txHash: request.txHash,
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
            txHash: request.txHash,
            metadata: {
                verificationTime,
                optimistic: this.config.optimistic,
            },
        });
        this.logger.info('Payment verified', {
            agentId: request.agentId,
            txHash: request.txHash,
            receiptId: receipt.receiptId,
            verificationTime,
        });
        // In optimistic mode, return success immediately
        // Settlement happens in background
        return {
            success: true,
            verified: true,
            txHash: request.txHash,
            receipt,
            verificationTime,
        };
    }
    /**
     * Step 3: Settle batch of payments (background job)
     */
    async settleBatch(receipts) {
        if (receipts.length === 0) {
            return { success: true };
        }
        this.logger.debug('Settling payment batch', {
            receiptCount: receipts.length,
        });
        // Group receipts by network
        const { groupReceiptsByNetwork } = await import('@xache/common');
        const receiptsByNetwork = groupReceiptsByNetwork(receipts);
        const results = [];
        // Settle each network separately
        for (const [network, networkReceipts] of Object.entries(receiptsByNetwork)) {
            const settlementRequest = {
                network: network,
                receipts: networkReceipts.map(r => ({
                    txHash: r.txHash || '',
                    amount: r.amountPaid,
                })),
            };
            const result = await this.config.facilitator.settleBatch(settlementRequest);
            results.push({
                network: network,
                success: result.success,
                error: result.error,
            });
            if (result.success) {
                this.logger.info('Batch settled successfully', {
                    network,
                    receiptCount: networkReceipts.length,
                    settlementTxHash: result.settlementTxHash,
                });
            }
            else {
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
    async processPayment(request) {
        // If no txHash, return payment challenge
        if (!request.txHash) {
            const challenge = await this.createPaymentChallenge(request);
            return {
                success: false,
                verified: false,
                paymentRequired: true,
                requirements: challenge,
            };
        }
        // If txHash provided, verify payment
        return await this.verifyPayment(request);
    }
    /**
     * Get circuit breaker status
     */
    getStatus() {
        return {
            circuitBreaker: this.config.facilitator.getCircuitBreakerStatus(),
            optimistic: this.config.optimistic,
        };
    }
}
/**
 * Create payment processor from environment
 */
export function createPaymentProcessor(facilitator) {
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
//# sourceMappingURL=payment-processor.js.map