/**
 * CDP x402 Facilitator Client for Xache Protocol
 * Based on x402-integration-answers-comprehensive.md and CDP documentation
 */

import {
  PAYMENT_TIMEOUTS,
  RETRY_POLICIES,
  calculateRetryDelay,
  toCaip2NetworkId,
  isCaip2NetworkId,
} from '@xache/constants';
import { signEIP3009Authorization } from '@xache/crypto';
import { createLogger, retryHttpRequest, CircuitBreaker } from '@xache/utils';
import type {
  PaymentRequirements,
  NetworkId,
} from '@xache/types';

/**
 * CDP Facilitator configuration
 */
export interface CDPFacilitatorConfig {
  /** CDP API Key ID (e.g., organizations/{org_id}/apiKeys/{key_id}) */
  apiKeyId: string;
  /** CDP API Key Secret (EC Private Key) */
  apiKeySecret: string;
  /** CDP Project ID */
  projectId?: string;
  /** Facilitator URL (default: CDP production) */
  facilitatorUrl?: string;
  /** Enable testnet mode */
  testnet?: boolean;
}

/**
 * Payment verification request
 * Carries full x402 PaymentPayload and PaymentRequirements objects
 * to be forwarded to CDP facilitator as-is per x402 spec
 */
interface VerifyRequest {
  /** x402 protocol version (must be 1) */
  x402Version: number;
  /** Full x402 PaymentPayload from X-PAYMENT header */
  paymentPayload: any;  // PaymentPayload type
  /** Full x402 PaymentRequirements from payment challenge */
  paymentRequirements: PaymentRequirements;
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
 * CDP API Response Types
 */

/**
 * CDP /verify endpoint response
 */
interface CDPVerifyResponse {
  /** Whether payment is verified */
  verified: boolean;
  /** Actual amount paid */
  amount?: string;
  /** Sender address */
  from?: string;
  /** Recipient address */
  to?: string;
  /** Token address */
  token?: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * CDP /settle batch endpoint response
 */
interface CDPSettleBatchResponse {
  /** Whether settlement succeeded */
  success: boolean;
  /** Settlement transaction hash */
  settlementTxHash?: string;
  /** Error message if settlement failed */
  error?: string;
}

/**
 * CDP /settle endpoint response for single payment
 */
interface CDPSettleResponse {
  /** Transaction details */
  transaction?: {
    /** Transaction hash */
    hash: string;
    /** Block number */
    blockNumber?: number;
    /** Status */
    status?: string;
  };
  /** Network where settled */
  network?: string;
  /** Error message if settlement failed */
  error?: string;
}

/**
 * CDP /supported endpoint response
 * Per https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/get-supported-payment-schemes-and-networks
 */
interface CDPSupportedKind {
  /** x402 protocol version */
  x402Version: number;
  /** Payment scheme (e.g., "exact") */
  scheme: string;
  /** Network identifier (e.g., "solana-devnet", "base-sepolia") */
  network: string;
  /** Optional scheme-specific metadata - contains feePayer for Solana */
  extra?: {
    /** CDP facilitator's fee payer address for Solana transactions */
    feePayer?: string;
    /** Token name for EVM */
    name?: string;
    /** Token version for EVM */
    version?: string;
    [key: string]: unknown;
  };
}

interface CDPSupportedNetworksResponse {
  /** List of supported payment kinds */
  kinds: CDPSupportedKind[];
  /** Legacy format - list of network IDs */
  networks?: NetworkId[];
}

/**
 * CDP x402 Facilitator Client
 */
export class CDPFacilitatorClient {
  private config: Required<CDPFacilitatorConfig>;
  private logger = createLogger({ service: 'cdp-facilitator' });
  private circuitBreaker = new CircuitBreaker(5, 2, 60000);

  /** Cache for supported networks with fee payers (5 minute TTL) */
  private supportedKindsCache: { data: CDPSupportedKind[]; expiresAt: number } | null = null;
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: CDPFacilitatorConfig) {
    this.config = {
      apiKeyId: config.apiKeyId,
      apiKeySecret: config.apiKeySecret,
      projectId: config.projectId || '',
      // Use Coinbase CDP x402 facilitator by default (production-ready)
      // See: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402/settle-a-payment
      // FIXED: Remove /platform from base URL - it's added by the settlement path computation
      facilitatorUrl: config.facilitatorUrl || 'https://api.cdp.coinbase.com',
      testnet: config.testnet || false,
    };

    this.logger.info('Initialized x402 facilitator', {
      facilitatorUrl: this.config.facilitatorUrl,
      testnet: this.config.testnet,
    });
  }

  /**
   * Generate x402 payment requirements
   */
  async generatePaymentChallenge(params: {
    amount: string;
    recipientAddress: string;
    network: NetworkId;
    resource: string;
  }): Promise<PaymentRequirements> {
    this.logger.debug('Generating payment challenge', params);

    const { amount, recipientAddress, network, resource } = params;

    // Get USDC contract address for network
    const { getUSDCAddress } = await import('@xache/constants');
    const usdcAddress = getUSDCAddress(network);

    // Convert USD to atomic units (6 decimals for USDC)
    const { usdToAtomicUnits } = await import('@xache/constants');
    const atomicUnits = usdToAtomicUnits(amount);

    // Create x402 payment requirements
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network,
      maxAmountRequired: atomicUnits,
      payTo: recipientAddress,
      asset: usdcAddress,
      resource, // Use actual API endpoint URL (e.g., "https://api.xache.xyz/v1/memory/store")
      description: `Xache Protocol payment: ${amount} USD`,
      mimeType: 'application/json',
      maxTimeoutSeconds: 60,
    };

    this.logger.info('Payment challenge generated', {
      amount,
      atomicUnits,
      network,
      resource,
    });

    return requirements;
  }

  /**
   * Verify and settle payment with optimistic timeout (500ms)
   * This calls /settle which executes the on-chain payment
   */
  async verifyPayment(request: VerifyRequest): Promise<VerifyResponse> {
    this.logger.debug('Settling payment on-chain', {
      network: request.paymentPayload.network,
      scheme: request.paymentPayload.scheme,
    });

    try {
      // Execute settlement through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        return await this.verifyPaymentInternal(request);
      });

      // Only log success if actually settled
      if (result.verified && result.txHash) {
        this.logger.info('Payment settled on-chain - SUCCESS', {
          network: request.paymentPayload.network,
          txHash: result.txHash,
          from: result.from,
          to: result.to,
        });
      } else {
        this.logger.warn('Payment verification/settlement failed', {
          network: request.paymentPayload.network,
          verified: result.verified,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Payment settlement failed', error as Error, {
        network: request.paymentPayload.network,
      });

      return {
        verified: false,
        txHash: '',
        amount: '0',
        from: '',
        to: '',
        token: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Internal settlement with retry
   * Implements two-step CDP flow per x402 spec:
   * 1. Call /verify to validate payment signature
   * 2. If valid, call /settle to execute on-chain
   * Format: { x402Version: 1, paymentPayload, paymentRequirements }
   * Response: { success, transaction: { hash }, network }
   */
  private async verifyPaymentInternal(
    request: VerifyRequest
  ): Promise<VerifyResponse> {
    const { result } = await retryHttpRequest(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          PAYMENT_TIMEOUTS.PAYMENT_VERIFICATION_MS
        );

        try {
          // STEP 1: Verify payment signature with CDP /verify endpoint
          const verifyUrl = `${this.config.facilitatorUrl}/platform/v2/x402/verify`;
          const verifyJWT = await this.generateJWT(verifyUrl);

          // DEBUG: Log payload type BEFORE building requestBody
          console.log('[CDP Facilitator] DEBUG: request.paymentPayload.payload type:', typeof request.paymentPayload.payload);
          console.log('[CDP Facilitator] DEBUG: request.paymentPayload.payload is object:', request.paymentPayload.payload !== null && typeof request.paymentPayload.payload === 'object');
          console.log('[CDP Facilitator] DEBUG: request.paymentPayload.payload keys:', request.paymentPayload.payload ? Object.keys(request.paymentPayload.payload) : 'N/A');

          // Convert network to CAIP-2 format for x402 v2
          // v1: 'base-sepolia' (simple name)
          // v2: 'eip155:84532' (CAIP-2 format)
          const x402Version = request.x402Version || 1;
          let networkId = request.paymentPayload.network;
          let requirementsNetworkId = request.paymentRequirements?.network;

          if (x402Version >= 2 && networkId && !isCaip2NetworkId(networkId)) {
            try {
              networkId = toCaip2NetworkId(networkId as any);
              console.log('[CDP Facilitator] Converted network to CAIP-2:', networkId);
            } catch (e) {
              console.warn('[CDP Facilitator] Failed to convert network to CAIP-2, using as-is:', networkId);
            }
          }

          if (x402Version >= 2 && requirementsNetworkId && !isCaip2NetworkId(requirementsNetworkId)) {
            try {
              requirementsNetworkId = toCaip2NetworkId(requirementsNetworkId as any) as typeof requirementsNetworkId;
            } catch (e) {
              // Keep original if conversion fails
            }
          }

          console.log('[CDP Facilitator] DEBUG: network for CDP =', networkId);
          console.log('[CDP Facilitator] DEBUG: requirementsNetwork for CDP =', requirementsNetworkId);

          // Build request body based on x402 version
          // v1: { paymentPayload: { scheme, network, payload }, paymentRequirements }
          // v2: { paymentPayload: { x402Version, accepted: {...}, payload }, paymentRequirements }
          let requestBody: any;

          if (x402Version >= 2) {
            // x402 v2 format - paymentPayload has 'accepted' field with requirements
            // v2 uses 'amount' instead of 'maxAmountRequired'
            const v2Requirements = {
              scheme: request.paymentRequirements?.scheme || 'exact',
              network: requirementsNetworkId,
              asset: request.paymentRequirements?.asset,
              amount: request.paymentRequirements?.maxAmountRequired,  // v2 uses 'amount'
              payTo: request.paymentRequirements?.payTo,
              maxTimeoutSeconds: request.paymentRequirements?.maxTimeoutSeconds || 60,
              extra: request.paymentRequirements?.extra,
            };

            requestBody = {
              x402Version: x402Version,
              paymentPayload: {
                x402Version: x402Version,
                accepted: v2Requirements,
                payload: request.paymentPayload.payload,
              },
              paymentRequirements: v2Requirements,  // Use v2 format for requirements too
            };
          } else {
            // x402 v1 format - paymentPayload has scheme, network directly
            requestBody = {
              x402Version: x402Version,
              paymentPayload: {
                x402Version: x402Version,
                scheme: request.paymentPayload.scheme,
                network: networkId,
                payload: request.paymentPayload.payload,
              },
              paymentRequirements: {
                ...request.paymentRequirements,
                network: requirementsNetworkId,
              },
            };
          }

          console.log('[CDP Facilitator] Built request body for x402 v' + x402Version);

          const verifyHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${verifyJWT}`,
          };

          if (this.config.projectId) {
            verifyHeaders['X-Cb-Project-Id'] = this.config.projectId;
          }

          // Add idempotency key for verify (required by CDP, must be UUID v4)
          const verifyIdempotencyKey = crypto.randomUUID();
          verifyHeaders['X-Idempotency-Key'] = verifyIdempotencyKey;

          this.logger.info('CDP payment verification - STEP 1: /verify', {
            verifyUrl,
            network: request.paymentPayload.network,
            scheme: request.paymentPayload.scheme,
          });

          // Log payment payload details separately for easy debugging
          if (requestBody.paymentPayload?.payload) {
            const payload = requestBody.paymentPayload.payload as any;
            const network = requestBody.paymentPayload.network;

            if (network?.includes('sol')) {
              // Solana x402 SVM payload
              this.logger.info('Solana x402 SVM payment details', {
                network,
                transaction: payload.transaction?.substring(0, 40) + '...',
                transactionLength: payload.transaction?.length,
                signers: payload.signers,
                signersCount: payload.signers?.length,
              });
            } else {
              // EVM ERC-3009 authorization payload
              this.logger.info('ERC-3009 authorization details - CRITICAL DEBUG', {
                network,
                signature: payload.signature?.substring(0, 20) + '...',
                signatureLength: payload.signature?.length,
                authorization: payload.authorization,
                from: payload.authorization?.from,
                to: payload.authorization?.to,
                value: payload.authorization?.value,
                nonce: payload.authorization?.nonce,
              });
            }
          }

          // Log FULL request body for debugging
          this.logger.info('FULL CDP VERIFY REQUEST BODY', {
            requestBodyFull: JSON.stringify(requestBody, null, 2),
            verifyUrl,
          });

          // Call CDP /verify endpoint
          const verifyResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: verifyHeaders,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          // Log raw response status and headers
          this.logger.info('CDP /verify RAW response status', {
            status: verifyResponse.status,
            statusText: verifyResponse.statusText,
            headers: Object.fromEntries(verifyResponse.headers.entries()),
          });

          if (!verifyResponse.ok) {
            const errorText = await verifyResponse.text();
            this.logger.error('CDP /verify failed', new Error(errorText), {
              status: verifyResponse.status,
              statusText: verifyResponse.statusText,
              errorText,
            });
            throw new Error(`Verification failed: ${verifyResponse.status} - ${errorText}`);
          }

          // Get response as text first, then parse
          const responseText = await verifyResponse.text();
          this.logger.info('CDP /verify RAW response body', {
            responseText: responseText.substring(0, 1000), // Limit to 1000 chars
            responseLength: responseText.length,
          });

          let verifyData: any = {};
          try {
            verifyData = JSON.parse(responseText);
          } catch (parseError) {
            this.logger.error('CDP /verify response parse error', parseError as Error, {
              responseText: responseText.substring(0, 500),
            });
            throw new Error('Failed to parse CDP /verify response');
          }

          this.logger.info('CDP /verify response PARSED', {
            fullResponse: JSON.stringify(verifyData, null, 2),
            isValid: verifyData.isValid,
            invalidReason: verifyData.invalidReason,
            payer: verifyData.payer,
          });

          // CDP returns isValid (not verified) and invalidReason (not error)
          const verified = verifyData.isValid === true;

          // If verification failed, return early (DON'T proceed to settle)
          if (!verified) {
            this.logger.warn('CDP /verify rejected payment', {
              isValid: verifyData.isValid,
              invalidReason: verifyData.invalidReason,
              payer: verifyData.payer,
            });

            return {
              verified: false,
              txHash: '',
              amount: '0',
              from: verifyData.payer || '',
              to: '',
              token: '',
              error: verifyData.invalidReason || 'Verification failed',
            };
          }

          // STEP 2: Settlement - Execute on-chain
          this.logger.info('CDP payment settlement - STEP 2: /settle');

          const settlementUrl = `${this.config.facilitatorUrl}/platform/v2/x402/settle`;
          const settleJWT = await this.generateJWT(settlementUrl);

          const settleHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settleJWT}`,
          };

          if (this.config.projectId) {
            settleHeaders['X-Cb-Project-Id'] = this.config.projectId;
          }

          // Add idempotency key for settle (new key, different from verify)
          const settleIdempotencyKey = crypto.randomUUID();
          settleHeaders['X-Idempotency-Key'] = settleIdempotencyKey;

          this.logger.info('FULL CDP SETTLE REQUEST BODY', {
            requestBodyFull: JSON.stringify(requestBody, null, 2),
            settlementUrl,
          });

          // Call CDP /settle endpoint
          const response = await fetch(settlementUrl, {
            method: 'POST',
            headers: settleHeaders,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();

            // Enhanced error logging - capture full response
            const error = new Error(`Settlement failed: ${response.status} ${response.statusText} - ${errorText}`);
            this.logger.error('CDP settlement failed - full response details', error, {
              status: response.status,
              statusText: response.statusText,
              errorText,
              responseHeaders: Object.fromEntries(response.headers.entries()),
              requestUrl: settlementUrl,  // FIXED: Use actual computed URL instead of hardcoded path
              requestBodySent: JSON.stringify(requestBody, null, 2),
            });

            throw error;
          }

          // Settlement returns: { success, payer, transaction, network, errorReason }
          // Per CDP docs: transaction is a DIRECT STRING (tx hash), not a nested object!
          const data = await response.json() as {
            success?: boolean;
            payer?: string;
            transaction?: string;  // FIXED: Direct string, not { hash }
            network?: string;
            errorReason?: string;  // FIXED: CDP uses errorReason, not error
          };

          // 🔍 Log FULL CDP response for debugging
          this.logger.info('CDP /settle response received - FULL DEBUG', {
            cdpResponseFull: JSON.stringify(data, null, 2),
            success: data.success,
            payer: data.payer,
            transaction: data.transaction,
            network: data.network,
            errorReason: data.errorReason,
          });

          // Extract actual on-chain transaction hash from settlement
          const txHash = data.transaction || '';  // FIXED: Direct string access

          // Only return verified=true if settlement succeeded AND we have a txHash
          const settled = data.success === true && !!txHash;

          if (!settled) {
            this.logger.warn('Settlement completed but verification failed', {
              success: data.success,
              hasTxHash: !!txHash,
              errorReason: data.errorReason,
              payer: data.payer,
            });
          }

          return {
            verified: settled,
            txHash,
            amount: request.paymentRequirements.maxAmountRequired,
            from: data.payer || '', // FIXED: Get payer from CDP response
            to: request.paymentRequirements.payTo,
            token: request.paymentRequirements.asset,
            error: data.errorReason,  // FIXED: Use errorReason field
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: RETRY_POLICIES.PAYMENT.maxAttempts,
        onRetry: (attempt, error, delayMs) => {
          this.logger.warn('Retrying payment verification', {
            attempt,
            error: error.message,
            delayMs,
          });
        },
      }
    );

    return result;
  }

  /**
   * Settle payments asynchronously
   */
  async settleBatch(request: SettleRequest): Promise<SettleResponse> {
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
    } catch (error) {
      this.logger.error('Batch settlement failed', error as Error, {
        network: request.network,
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Internal settlement with retry
   */
  private async settleBatchInternal(
    request: SettleRequest
  ): Promise<SettleResponse> {
    const { result } = await retryHttpRequest(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          PAYMENT_TIMEOUTS.SETTLEMENT_RECONCILIATION_MS
        );

        try {
          // Build full settlement URL
          const settlementUrl = `${this.config.facilitatorUrl}/platform/v2/x402/settle`;

          // Generate JWT for authentication
          const jwt = await this.generateJWT(settlementUrl);

          // Call CDP facilitator /settle endpoint
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
          };

          // Add project ID header if configured
          if (this.config.projectId) {
            headers['X-Cb-Project-Id'] = this.config.projectId;
          }

          const response = await fetch(settlementUrl, {
            method: 'POST',
            headers,
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

          const data = await response.json() as CDPSettleBatchResponse;

          return {
            success: data.success === true,
            settlementTxHash: data.settlementTxHash,
            error: data.error,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: RETRY_POLICIES.BLOCKCHAIN.maxAttempts,
        onRetry: (attempt, error, delayMs) => {
          this.logger.warn('Retrying batch settlement', {
            attempt,
            error: error.message,
            delayMs,
          });
        },
      }
    );

    return result;
  }

  /**
   * Settle single payment on-chain (x402 PaymentFacilitator interface)
   * Implements the PaymentFacilitator.settle() method per x402 spec
   *
   * @param request Settlement request with payment payload and requirements
   * @returns Settlement response with transaction hash
   */
  async settle(request: any): Promise<any> {
    this.logger.debug('Settling payment per x402 spec', {
      network: request.paymentPayload.network,
      scheme: request.paymentPayload.scheme,
    });

    try {
      // Execute settlement through circuit breaker
      return await this.circuitBreaker.execute(async () => {
        return await this.settleInternal(request);
      });
    } catch (error) {
      this.logger.error('Settlement error', error as Error);
      return {
        success: false,
        error: (error as Error).message || 'Internal settlement error',
      };
    }
  }

  /**
   * Internal settlement logic
   */
  private async settleInternal(request: any): Promise<any> {
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

    // Build CDP /settle request per x402 spec
    // FIXED: Use nested structure matching x402 protocol specification
    const settleBody = {
      x402Version: 1,
      paymentPayload: {
        // FIXED: Remove duplicate x402Version (per x402 spec)
        scheme: paymentPayload.scheme,
        network: paymentPayload.network,
        payload: paymentPayload.payload,  // Contains { authorization, signature } or { transaction, signers }
      },
      paymentRequirements: {
        scheme: paymentRequirements.scheme || scheme,
        network: paymentRequirements.network || network,
        maxAmountRequired: paymentRequirements.maxAmountRequired,
        asset: paymentRequirements.asset,
        payTo: paymentRequirements.payTo,
        resource: paymentRequirements.resource || '',
        description: paymentRequirements.description || 'Payment settlement',
        mimeType: paymentRequirements.mimeType || 'application/json',
        // FIXED: Add extra field with USDC token metadata (per x402 spec)
        extra: {
          name: 'USDC',
          version: '2',
        },
      },
    };

    // Call settlement endpoint - use correct path for CDP vs x402.org
    const isX402Org = this.config.facilitatorUrl?.includes('x402.org');
    const isCDP = !isX402Org;
    const uri = isCDP
      ? `${this.config.facilitatorUrl}/platform/v2/x402/settle`  // CDP requires /platform/v2/x402/settle
      : `${this.config.facilitatorUrl}/settle`;                   // x402.org uses /settle
    const jwt = await this.generateJWT(uri);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    };

    // Add project ID header if configured
    if (this.config.projectId) {
      headers['X-Cb-Project-Id'] = this.config.projectId;
    }

    const response = await fetch(uri, {
      method: 'POST',
      headers,
      body: JSON.stringify(settleBody),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Try to parse CDP error response with correlationId
      let cdpError: any = null;
      try {
        cdpError = JSON.parse(errorText);
      } catch {
        // Not JSON, use raw text
      }

      this.logger.error('CDP settle failed', new Error(errorText), {
        status: response.status,
        errorType: cdpError?.errorType,
        errorMessage: cdpError?.errorMessage,
        correlationId: cdpError?.correlationId,
        errorLink: cdpError?.errorLink,
      });

      const errorMsg = cdpError
        ? `${cdpError.errorType || 'error'}: ${cdpError.errorMessage || errorText} (correlationId: ${cdpError.correlationId || 'unknown'})`
        : `Settlement failed: ${response.status} - ${errorText}`;

      return {
        success: false,
        error: errorMsg,
      };
    }

    const data = await response.json() as CDPSettleResponse;

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

  /**
   * Get supported payment kinds from CDP facilitator
   * Returns the full response including feePayer addresses for Solana
   */
  async getSupportedKinds(): Promise<CDPSupportedKind[]> {
    // Check cache first
    if (this.supportedKindsCache && Date.now() < this.supportedKindsCache.expiresAt) {
      return this.supportedKindsCache.data;
    }

    try {
      // Execute through circuit breaker
      const kinds = await this.circuitBreaker.execute(async () => {
        const url = `${this.config.facilitatorUrl}/platform/v2/x402/supported`;
        this.logger.debug('Fetching supported kinds from CDP', { url });

        // Generate JWT for authentication - IMPORTANT: method must be 'GET' to match actual request
        const jwt = await this.generateJWT(url, 'GET');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add auth if JWT was generated
        if (jwt) {
          headers['Authorization'] = `Bearer ${jwt}`;
        }

        // Add project ID header if configured
        if (this.config.projectId) {
          headers['X-Cb-Project-Id'] = this.config.projectId;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to get supported kinds: ${response.status} - ${text}`);
        }

        const data = await response.json() as CDPSupportedNetworksResponse;
        return data.kinds || [];
      });

      // Cache the result
      this.supportedKindsCache = {
        data: kinds,
        expiresAt: Date.now() + CDPFacilitatorClient.CACHE_TTL_MS,
      };

      this.logger.info('Fetched supported kinds from CDP', {
        count: kinds.length,
        networks: kinds.map(k => k.network),
      });

      return kinds;
    } catch (error) {
      this.logger.error('Failed to get supported kinds', error as Error);
      // Return empty array on error - caller should handle this
      return [];
    }
  }

  /**
   * Get the CDP facilitator's fee payer address for a Solana network
   * This is required for constructing x402 SVM payment transactions
   */
  async getFeePayer(network: NetworkId): Promise<string | null> {
    // Only Solana networks need feePayer
    if (!network.includes('solana')) {
      return null;
    }

    const kinds = await this.getSupportedKinds();
    const kind = kinds.find(k => k.network === network && k.scheme === 'exact');

    if (!kind || !kind.extra?.feePayer) {
      this.logger.warn('No feePayer found for network', { network });
      return null;
    }

    this.logger.debug('Found feePayer for network', {
      network,
      feePayer: kind.extra.feePayer,
    });

    return kind.extra.feePayer;
  }

  /**
   * Get supported networks from facilitator
   */
  async getSupportedNetworks(): Promise<NetworkId[]> {
    try {
      const kinds = await this.getSupportedKinds();
      return kinds.map(k => k.network as NetworkId);
    } catch (error) {
      this.logger.error('Failed to get supported networks', error as Error);
      // Return default networks
      return this.config.testnet
        ? ['base-sepolia', 'solana-devnet']
        : ['base', 'solana'];
    }
  }

  /**
   * Convert base64-encoded key to PEM format
   * CDP API keys can be in PKCS#8 format (required by jose.importPKCS8)
   * Per CDP docs: https://docs.cdp.coinbase.com/coinbase-business/authentication-authorization/api-key-authentication
   */
  private base64ToPem(base64Key: string): string {
    // Remove any whitespace
    const cleanBase64 = base64Key.replace(/\s/g, '');

    // If already in PEM format, return as-is
    if (cleanBase64.includes('-----BEGIN')) {
      return cleanBase64;
    }

    // Split base64 into 64-character lines (PEM format requirement)
    const lines = cleanBase64.match(/.{1,64}/g) || [];
    const formattedKey = lines.join('\n');

    // Use PKCS#8 format (required by jose.importPKCS8)
    // If CDP provides EC format keys, they need to be converted to PKCS#8
    return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
  }

  /**
   * Generate JWT for x402 facilitator authentication
   * Manually constructs JWT following CDP specification:
   * - iss (issuer): API key ID
   * - sub (subject): API key ID
   * - aud (audience): extracted from requestHost
   * - kid (key ID): API key ID
   * - nbf (not before): current time
   * - exp (expiration): nbf + 2 minutes
   * - uri: requestMethod + space + requestHost + requestPath
   *
   * Algorithm: EdDSA (Ed25519)
   *
   * Implementation based on CDP documentation:
   * https://docs.cdp.coinbase.com/api-reference/v2/authentication
   *
   * @param uri - The full URL being accessed
   * @param method - HTTP method (GET, POST, etc.) - MUST match actual request method
   */
  private async generateJWT(uri: string, method: string = 'POST'): Promise<string> {
    // Skip JWT if no API keys configured (for local testing)
    if (!this.config.apiKeyId || !this.config.apiKeySecret) {
      this.logger.warn('No API keys configured, skipping JWT generation');
      return '';
    }

    try {
      const { SignJWT, importPKCS8 } = await import('jose');

      // Parse URL to extract requestHost and requestPath
      const url = new URL(uri);
      const requestMethod = method.toUpperCase();
      const requestHost = url.host;
      const requestPath = url.pathname;

      this.logger.debug('Generating CDP JWT with jose library', {
        requestMethod,
        requestHost,
        requestPath,
        apiKeyId: this.config.apiKeyId,
      });

      // Handle different key formats
      let pemKey: string;

      // Check if key is already in PEM format
      if (this.config.apiKeySecret.includes('-----BEGIN PRIVATE KEY-----')) {
        this.logger.debug('Using PEM-formatted private key');
        pemKey = this.config.apiKeySecret;
      } else {
        // Assume base64-encoded Ed25519 key
        this.logger.debug('Converting base64 Ed25519 key to PEM format');

        let keyBytes: Buffer;
        try {
          keyBytes = Buffer.from(this.config.apiKeySecret, 'base64');
        } catch (err) {
          throw new Error(`Failed to decode base64 API key: ${(err as Error).message}`);
        }

        let seed: Buffer;

        // CDP keys can be either:
        // - 32 bytes (just the seed)
        // - 64 bytes (32-byte seed + 32-byte public key)
        if (keyBytes.length === 32) {
          this.logger.debug('Using 32-byte Ed25519 seed');
          seed = keyBytes;
        } else if (keyBytes.length === 64) {
          this.logger.debug('Extracting 32-byte seed from 64-byte key');
          seed = keyBytes.slice(0, 32);
        } else {
          throw new Error(
            `Invalid Ed25519 key length: ${keyBytes.length} bytes. ` +
            `Expected 32 bytes (seed only) or 64 bytes (seed + public key). ` +
            `Key format: ${this.config.apiKeySecret.substring(0, 20)}...`
          );
        }

        // Convert to PKCS#8 PEM format for jose library
        // PKCS#8 structure for Ed25519:
        // 0x30 0x2e = SEQUENCE, 46 bytes
        // 0x02 0x01 0x00 = INTEGER version 0
        // 0x30 0x05 0x06 0x03 0x2b 0x65 0x70 = AlgorithmIdentifier (OID 1.3.101.112 = Ed25519)
        // 0x04 0x22 = OCTET STRING, 34 bytes
        // 0x04 0x20 = OCTET STRING, 32 bytes (the actual seed)
        const pkcs8Header = Buffer.from([
          0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
        ]);

        const pkcs8Der = Buffer.concat([pkcs8Header, seed]);
        const pkcs8Base64 = pkcs8Der.toString('base64');

        pemKey = `-----BEGIN PRIVATE KEY-----\n${pkcs8Base64}\n-----END PRIVATE KEY-----`;
      }

      // Import the private key using jose
      let privateKey: any;
      try {
        privateKey = await importPKCS8(pemKey, 'EdDSA');
      } catch (err) {
        throw new Error(`Failed to import Ed25519 private key: ${(err as Error).message}`);
      }

      // Build JWT claims according to CDP specification
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: "cdp",                  // Issuer: MUST be literal "cdp" (per CDP docs)
        sub: this.config.apiKeyId,  // Subject: API key ID
        aud: ["cdp_service"],        // Audience: MUST be ["cdp_service"] array (per CDP docs)
        iat: now,                    // Issued at: now (REQUIRED by CDP)
        nbf: now,                    // Not before: now
        exp: now + 120,              // Expires: 2 minutes from now
        uri: `${requestMethod} ${requestHost}${requestPath}`,  // Request URI (singular string, per CDP docs)
      };

      // Generate random nonce (16+ hex characters required by CDP)
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Sign JWT with Ed25519
      const jwt = await new SignJWT(payload)
        .setProtectedHeader({
          alg: 'EdDSA',
          kid: this.config.apiKeyId,
          typ: 'JWT',
          nonce,  // REQUIRED by CDP (16+ random hex characters)
        })
        .sign(privateKey);

      this.logger.debug('JWT generated successfully', {
        issuer: 'cdp',
        subject: this.config.apiKeyId,
        audience: ['cdp_service'],
        uri: payload.uri,
        nonce,
        expiresIn: 120,
      });

      return jwt;
    } catch (error) {
      this.logger.error('Failed to generate CDP JWT', error as Error, {
        apiKeyId: this.config.apiKeyId,
        uri,
        errorDetails: (error as Error).message,
      });
      throw new Error(`JWT generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    this.logger.info('Circuit breaker reset');
  }
}

/**
 * Create CDP facilitator client from environment variables
 */
export function createCDPFacilitatorFromEnv(): CDPFacilitatorClient {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const projectId = process.env.CDP_PROJECT_ID;
  const testnet = process.env.NODE_ENV !== 'production';

  if (!apiKeyId || !apiKeySecret) {
    throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set');
  }

  return new CDPFacilitatorClient({
    apiKeyId,
    apiKeySecret,
    projectId,
    testnet,
  });
}
