/**
 * CDP x402 Facilitator Client for Xache Protocol
 * Based on x402-integration-answers-comprehensive.md and CDP documentation
 */
import { PAYMENT_TIMEOUTS, RETRY_POLICIES, } from '@xache/constants';
import { createLogger, retryHttpRequest, CircuitBreaker } from '@xache/utils';
/**
 * CDP x402 Facilitator Client
 */
export class CDPFacilitatorClient {
    config;
    logger = createLogger({ service: 'cdp-facilitator' });
    circuitBreaker = new CircuitBreaker(5, 2, 60000);
    constructor(config) {
        this.config = {
            apiKeyId: config.apiKeyId,
            apiKeySecret: config.apiKeySecret,
            facilitatorUrl: config.facilitatorUrl || 'https://api.developer.coinbase.com/x402',
            testnet: config.testnet || false,
        };
        if (this.config.testnet) {
            this.config.facilitatorUrl = 'https://x402.org/facilitator';
            this.logger.info('Initialized CDP facilitator in testnet mode');
        }
    }
    /**
     * Generate x402 payment requirements
     */
    async generatePaymentChallenge(params) {
        this.logger.debug('Generating payment challenge', params);
        const { amount, recipientAddress, network } = params;
        // Get USDC contract address for network
        const { getUSDCAddress } = await import('@xache/constants');
        const usdcAddress = getUSDCAddress(network);
        // Convert USD to atomic units (6 decimals for USDC)
        const { usdToAtomicUnits } = await import('@xache/constants');
        const atomicUnits = usdToAtomicUnits(amount);
        // Create x402 payment requirements
        const requirements = {
            scheme: 'exact',
            network,
            maxAmountRequired: atomicUnits,
            payTo: recipientAddress,
            asset: usdcAddress,
            resource: 'https://api.xache.org',
            description: `Xache Protocol payment: ${amount} USD`,
            mimeType: 'application/json',
            maxTimeoutSeconds: 60,
        };
        this.logger.info('Payment challenge generated', {
            amount,
            atomicUnits,
            network,
        });
        return requirements;
    }
    /**
     * Verify payment with optimistic timeout (500ms)
     */
    async verifyPayment(request) {
        this.logger.debug('Verifying payment', {
            network: request.network,
            txHash: request.txHash,
        });
        try {
            // Execute verification through circuit breaker
            const result = await this.circuitBreaker.execute(async () => {
                return await this.verifyPaymentInternal(request);
            });
            this.logger.info('Payment verified', {
                txHash: request.txHash,
                verified: result.verified,
            });
            return result;
        }
        catch (error) {
            this.logger.error('Payment verification failed', error, {
                txHash: request.txHash,
            });
            return {
                verified: false,
                txHash: request.txHash,
                amount: '0',
                from: '',
                to: '',
                token: '',
                error: error.message,
            };
        }
    }
    /**
     * Internal verification with retry
     */
    async verifyPaymentInternal(request) {
        const { result } = await retryHttpRequest(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUTS.PAYMENT_VERIFICATION_MS);
            try {
                // Generate JWT for authentication
                const jwt = await this.generateJWT('POST /x402/verify');
                // Call CDP facilitator /verify endpoint
                const response = await fetch(`${this.config.facilitatorUrl}/verify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwt}`,
                    },
                    body: JSON.stringify({
                        network: request.network,
                        txHash: request.txHash,
                        expectedAmount: request.expectedAmount,
                        expectedRecipient: request.expectedRecipient,
                        expectedToken: request.expectedToken,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`Verification failed: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                return {
                    verified: data.verified === true,
                    txHash: request.txHash,
                    amount: data.amount || '0',
                    from: data.from || '',
                    to: data.to || '',
                    token: data.token || '',
                    error: data.error,
                };
            }
            finally {
                clearTimeout(timeoutId);
            }
        }, {
            maxAttempts: RETRY_POLICIES.PAYMENT.maxAttempts,
            onRetry: (attempt, error, delayMs) => {
                this.logger.warn('Retrying payment verification', {
                    attempt,
                    error: error.message,
                    delayMs,
                });
            },
        });
        return result;
    }
    /**
     * Settle payments asynchronously
     */
    async settleBatch(request) {
        this.logger.debug('Settling payment batch', {
            network: request.network,
            receiptCount: request.receipts.length,
        });
        try {
            // Execute settlement through circuit breaker
            const result = await this.circuitBreaker.execute(async () => {
                return await this.settleBatchInternal(request);
            });
            this.logger.info('Batch settlement initiated', {
                network: request.network,
                success: result.success,
            });
            return result;
        }
        catch (error) {
            this.logger.error('Batch settlement failed', error, {
                network: request.network,
            });
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Internal settlement with retry
     */
    async settleBatchInternal(request) {
        const { result } = await retryHttpRequest(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUTS.SETTLEMENT_RECONCILIATION_MS);
            try {
                // Generate JWT for authentication
                const jwt = await this.generateJWT('POST /x402/settle');
                // Call CDP facilitator /settle endpoint
                const response = await fetch(`${this.config.facilitatorUrl}/settle`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwt}`,
                    },
                    body: JSON.stringify({
                        network: request.network,
                        receipts: request.receipts,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`Settlement failed: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                return {
                    success: data.success === true,
                    settlementTxHash: data.settlementTxHash,
                    error: data.error,
                };
            }
            finally {
                clearTimeout(timeoutId);
            }
        }, {
            maxAttempts: RETRY_POLICIES.BLOCKCHAIN.maxAttempts,
            onRetry: (attempt, error, delayMs) => {
                this.logger.warn('Retrying batch settlement', {
                    attempt,
                    error: error.message,
                    delayMs,
                });
            },
        });
        return result;
    }
    /**
     * Settle single payment on-chain (x402 PaymentFacilitator interface)
     * Implements the PaymentFacilitator.settle() method per x402 spec
     *
     * @param request Settlement request with payment payload and requirements
     * @returns Settlement response with transaction hash
     */
    async settle(request) {
        this.logger.debug('Settling payment per x402 spec', {
            network: request.paymentPayload.network,
            scheme: request.paymentPayload.scheme,
        });
        try {
            // Validate request format
            if (!request.paymentPayload || !request.paymentRequirements) {
                return {
                    success: false,
                    error: 'Invalid settlement request: missing paymentPayload or paymentRequirements',
                };
            }
            const { paymentPayload, paymentRequirements } = request;
            // Extract network and payment data
            const network = paymentPayload.network || paymentRequirements.network;
            const scheme = paymentPayload.scheme || 'exact';
            // Build CDP /settle request
            // CDP expects the signed transaction/authorization to be submitted
            const settleBody = {
                network,
                scheme,
                asset: paymentRequirements.asset,
                amount: paymentRequirements.maxAmountRequired,
                recipient: paymentRequirements.payTo,
            };
            // Add payload based on network type
            if (network.startsWith('solana')) {
                // Solana: submit partially-signed transaction
                settleBody.transaction = paymentPayload.payload.transaction;
            }
            else {
                // EVM: submit EIP-3009 authorization + signature
                settleBody.signature = paymentPayload.payload.signature;
                settleBody.authorization = paymentPayload.payload.authorization;
            }
            // Call CDP /settle endpoint
            const uri = `/settle`;
            const jwt = await this.generateJWT(uri);
            const response = await fetch(`${this.config.facilitatorUrl}${uri}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
                },
                body: JSON.stringify(settleBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('CDP settle failed', new Error(errorText), {
                    status: response.status,
                });
                return {
                    success: false,
                    error: `Settlement failed: ${response.status} - ${errorText}`,
                };
            }
            const data = await response.json();
            // Check if settlement was successful
            if (!data.transaction || !data.transaction.hash) {
                return {
                    success: false,
                    error: data.error || 'No transaction hash returned from CDP',
                };
            }
            this.logger.info('Payment settled successfully via CDP', {
                network,
                txHash: data.transaction.hash,
            });
            return {
                success: true,
                transaction: data.transaction.hash,
                network: data.network || network,
            };
        }
        catch (error) {
            this.logger.error('Settlement error', error);
            return {
                success: false,
                error: error.message || 'Internal settlement error',
            };
        }
    }
    /**
     * Get supported networks from facilitator
     */
    async getSupportedNetworks() {
        try {
            const response = await fetch(`${this.config.facilitatorUrl}/supported`);
            if (!response.ok) {
                throw new Error(`Failed to get supported networks: ${response.status}`);
            }
            const data = await response.json();
            return data.networks || [];
        }
        catch (error) {
            this.logger.error('Failed to get supported networks', error);
            // Return default networks
            return this.config.testnet
                ? ['base-sepolia', 'solana-devnet']
                : ['base', 'solana'];
        }
    }
    /**
     * Generate JWT for CDP authentication
     * Uses ES256 algorithm with CDP API private key
     * Based on x402-integration-answers Q2
     */
    async generateJWT(uri) {
        // For testnet, no authentication required
        if (this.config.testnet) {
            return '';
        }
        try {
            // Import jose for JWT signing
            const { SignJWT, importPKCS8 } = await import('jose');
            // Parse the PEM private key
            const privateKey = await importPKCS8(this.config.apiKeySecret, 'ES256');
            // Create JWT with CDP-required claims
            const jwt = await new SignJWT({
                aud: 'cdp',
                sub: this.config.apiKeyId,
            })
                .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
                .setIssuedAt()
                .setExpirationTime('5m') // CDP tokens expire after 5 minutes
                .setIssuer(this.config.apiKeyId)
                .setSubject(this.config.apiKeyId)
                .sign(privateKey);
            this.logger.debug('Generated CDP JWT', {
                keyId: this.config.apiKeyId.substring(0, 20) + '...',
                expiresIn: '5m',
            });
            return jwt;
        }
        catch (error) {
            this.logger.error('Failed to generate CDP JWT', error);
            throw new Error(`JWT generation failed: ${error.message}`);
        }
    }
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus() {
        return this.circuitBreaker.getState();
    }
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
        this.logger.info('Circuit breaker reset');
    }
}
/**
 * Create CDP facilitator client from environment variables
 */
export function createCDPFacilitatorFromEnv() {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const testnet = process.env.NODE_ENV !== 'production';
    if (!apiKeyId || !apiKeySecret) {
        throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set');
    }
    return new CDPFacilitatorClient({
        apiKeyId,
        apiKeySecret,
        testnet,
    });
}
//# sourceMappingURL=cdp-facilitator.js.map