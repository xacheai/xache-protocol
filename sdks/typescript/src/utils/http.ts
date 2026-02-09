/**
 * HTTP client utilities with retry logic
 */

import type { APIResponse, Payment402Response } from '../types';
import { createErrorFromResponse, PaymentRequiredError, NetworkError } from '../errors/XacheError';
import { PaymentHandler, type PaymentChallenge, type PaymentResult } from '../payment/PaymentHandler';
import type { ISigningAdapter } from '../crypto/SigningAdapter';
import { ReadOnlySigningAdapter } from '../crypto/SigningAdapter';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  /** Custom idempotency key for POST/PUT requests (auto-generated if not provided) */
  idempotencyKey?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * HTTP client with retry logic
 */
export class HttpClient {
  private readonly timeout: number;
  private readonly retryConfig: RetryConfig;
  private readonly debug: boolean;
  private readonly paymentHandler?: PaymentHandler;

  constructor(
    timeout: number = 30000,
    retryConfig?: Partial<RetryConfig>,
    debug: boolean = false,
    signingAdapter?: ISigningAdapter
  ) {
    this.timeout = timeout;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.debug = debug;

    // Initialize payment handler if signing adapter has signing capability
    if (signingAdapter && !(signingAdapter instanceof ReadOnlySigningAdapter)) {
      this.paymentHandler = new PaymentHandler(signingAdapter, debug);
    }
  }

  /**
   * Generate a unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(options: HttpRequestOptions): Promise<APIResponse<T>> {
    const { method, url, headers = {}, body, timeout = this.timeout, idempotencyKey } = options;

    // Add idempotency key for POST/PUT requests to ensure safe retries
    const requestHeaders = { ...headers };
    if ((method === 'POST' || method === 'PUT') && !requestHeaders['Idempotency-Key']) {
      requestHeaders['Idempotency-Key'] = idempotencyKey || this.generateIdempotencyKey();
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.retryConfig.maxRetries) {
      try {
        if (this.debug && attempt > 0) {
          console.log(`Retry attempt ${attempt}/${this.retryConfig.maxRetries} for ${method} ${url}`);
        }

        const response = await this.makeRequest(method, url, requestHeaders, body, timeout);

        // Success - return response
        if (response.ok || response.status === 402) {
          try {
            return await this.handleResponse<T>(response);
          } catch (error) {
            // Handle 402 Payment Required with autopay
            if (error instanceof PaymentRequiredError) {
              if (this.debug) {
                console.log('[HttpClient] Caught 402 Payment Required - attempting autopay');
              }
              return await this.handlePaymentRequired<T>(options, error);
            }
            throw error;
          }
        }

        // Check if we should retry
        if (this.retryConfig.retryableStatusCodes.includes(response.status)) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          attempt++;

          if (attempt <= this.retryConfig.maxRetries) {
            await this.delay(this.calculateDelay(attempt));
            continue;
          }
        }

        // Non-retryable error - parse and throw
        return await this.handleResponse<T>(response);
      } catch (error) {
        lastError = error as Error;

        if (this.debug) {
          console.log(`Attempt ${attempt} failed:`, error);
        }

        // Check if this is a non-retryable error (4xx client errors except 408/429)
        // XacheError has statusCode property set correctly
        const err = error as any;
        if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 408 && err.statusCode !== 429) {
          // Client errors (except 408 timeout and 429 rate limit) should not be retried
          // Re-throw the original error with proper message for agent experience
          throw error;
        }

        // Also check for XacheError subclasses that have the code property
        if (err.code && ['INVALID_INPUT', 'UNAUTHENTICATED', 'CONFLICT', 'BUDGET_EXCEEDED'].includes(err.code)) {
          // These are definitive client errors - don't retry
          throw error;
        }

        attempt++;

        if (attempt <= this.retryConfig.maxRetries) {
          await this.delay(this.calculateDelay(attempt));
          continue;
        }
      }
    }

    // All retries exhausted - include the original error message for better debugging
    const originalMessage = lastError?.message || 'Unknown error';
    throw new NetworkError(
      `Request failed after ${this.retryConfig.maxRetries} retries: ${originalMessage}`,
      lastError!
    );
  }

  /**
   * Make single HTTP request
   */
  private async makeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle response and parse
   */
  private async handleResponse<T>(response: Response): Promise<APIResponse<T>> {
    const emptyMeta = {
      requestId: response.headers.get('X-Request-ID') || response.headers.get('x-request-id') || '',
      timestamp: new Date().toISOString(),
      duration: 0,
    };

    // Handle 204 No Content and empty responses
    if (response.status === 204) {
      return { success: true, data: undefined as T, meta: emptyMeta };
    }

    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type') || '';

    // Handle empty body responses
    if (contentLength === '0' || (!contentType.includes('application/json') && response.ok)) {
      return { success: true, data: undefined as T, meta: emptyMeta };
    }

    let json: any;

    try {
      const text = await response.text();
      // Handle truly empty responses
      if (!text || text.trim() === '') {
        return { success: true, data: undefined as T, meta: emptyMeta };
      }
      json = JSON.parse(text);
    } catch (error) {
      throw new NetworkError('Failed to parse response JSON', error as Error);
    }

    // Handle 402 Payment Required (x402-compliant)
    if (response.status === 402) {
      // Check if this is x402 format (has x402Version field) - supports v1 and v2
      if ((json.x402Version === 1 || json.x402Version === 2) && json.accepts && Array.isArray(json.accepts) && json.accepts.length > 0) {
        // Extract payment requirements from x402 format
        const requirements = json.accepts[0];
        const challengeId = response.headers.get('X-Challenge-ID') || response.headers.get('x-challenge-id') || '';
        const requestId = response.headers.get('X-Request-ID') || response.headers.get('x-request-id') || undefined;

        // Encode full payment details in chainHint for PaymentHandler
        // Format: "network:asset:amount:feePayer" (e.g., "solana-devnet:4zMMC9....:1000:Fap3Y...")
        // We have to use chainHint field to pass this data since PaymentRequiredError
        // doesn't have dedicated fields for network, asset, and feePayer
        const feePayer = requirements.extra?.feePayer || '';
        const encodedHint = `${requirements.network}:${requirements.asset}:${requirements.maxAmountRequired}:${feePayer}` as any;

        throw new PaymentRequiredError(
          json.error || 'Payment required',
          challengeId,
          requirements.maxAmountRequired,
          encodedHint,
          requirements.payTo,
          requirements.description || 'Payment required',
          requestId,
          requirements.resource || ''
        );
      }

      // Fallback to old custom format (for backward compatibility)
      const payment402 = json as any;
      throw new PaymentRequiredError(
        payment402.error?.message || 'Payment required',
        payment402.payment?.challengeId || '',
        payment402.payment?.amount || '0',
        payment402.payment?.chainHint || 'base',
        payment402.payment?.payTo || '',
        payment402.payment?.description || 'Payment required',
        payment402.meta?.requestId
      );
    }

    // Handle API error responses
    if (!json.success && json.error) {
      throw createErrorFromResponse(
        json.error.code,
        json.error.message,
        response.status,
        json.error.details,
        json.meta?.requestId
      );
    }

    // Success response
    return json as APIResponse<T>;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
      this.retryConfig.maxDelay
    );

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle payment required (402) response with automatic payment
   */
  private async handlePaymentRequired<T>(
    originalOptions: HttpRequestOptions,
    error: PaymentRequiredError
  ): Promise<APIResponse<T>> {
    // Check if payment handler is available
    if (!this.paymentHandler) {
      if (this.debug) {
        console.log('[HttpClient] No payment handler configured - cannot autopay');
      }
      throw error;
    }

    if (this.debug) {
      console.log('[HttpClient] 402 Payment Required - initiating autopay:', {
        challengeId: error.challengeId,
        amount: error.amount,
        payTo: error.payTo,
      });
    }

    try {
      // Parse chainHint which contains "network:asset:amount:feePayer" format
      // e.g., "solana-devnet:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU:1000:Fap3YahRTvxjFT2cmASkJUBeRwVtRkZvd3GxF9QCHryD"
      const parts = (error.chainHint || 'base-sepolia::0:').split(':');
      const network = parts[0] || 'base-sepolia';
      const asset = parts[1] || '';
      const amount = parts[2] || error.amount;
      const feePayer = parts[3] || ''; // Extract feePayer from encoded hint

      if (this.debug) {
        console.log('[HttpClient] Parsed 402 payment challenge:', {
          chainHint: error.chainHint,
          parts,
          network,
          asset,
          amount,
          feePayer,
          errorAmount: error.amount,
        });
      }

      const challenge: PaymentChallenge = {
        challengeId: error.challengeId,
        amount: amount,
        network: network,
        payTo: error.payTo,
        asset: asset, // USDC contract address
        description: typeof error.details === 'string' ? error.details : 'Payment required',
        resource: error.resource, // API endpoint URL from 402 response
        feePayer: feePayer, // Fee payer address for Solana transactions
      };

      // Process payment automatically
      if (this.debug) {
        console.log('[HttpClient] Processing payment...');
      }

      const paymentResult = await this.paymentHandler.handlePayment(challenge);

      // Use new paymentHeader field, fall back to xPaymentHeader for backward compat
      const paymentHeader = paymentResult.paymentHeader || paymentResult.xPaymentHeader;
      const headerName = paymentResult.headerName || 'X-PAYMENT';

      // Deprecation warning
      if (!paymentResult.paymentHeader && paymentResult.xPaymentHeader) {
        console.warn('[Xache] DEPRECATION: xPaymentHeader is deprecated. Use paymentHeader instead.');
      }

      if (!paymentResult.success || !paymentHeader) {
        throw new Error(paymentResult.error || 'Payment processing failed');
      }

      if (this.debug) {
        const version = paymentResult.version || 1;
        console.log(`[HttpClient] Payment successful - retrying request with x402 v${version} ${headerName} header`);
      }

      // Retry original request with payment header (v1: X-PAYMENT, v2: PAYMENT-SIGNATURE) and Idempotency-Key
      const retryOptions: HttpRequestOptions = {
        ...originalOptions,
        headers: {
          ...originalOptions.headers,
          [headerName]: paymentHeader,
          'Idempotency-Key': error.challengeId,
        },
      };

      // Make retry request (this won't trigger payment again due to Idempotency-Key)
      const response = await this.makeRequest(
        retryOptions.method,
        retryOptions.url,
        retryOptions.headers || {},
        retryOptions.body,
        retryOptions.timeout || this.timeout
      );

      // Parse and return the response
      return await this.handleResponse<T>(response);
    } catch (paymentError) {
      if (this.debug) {
        console.error('[HttpClient] Autopay failed:', paymentError);
      }
      throw new Error(
        `Payment processing failed: ${(paymentError as Error).message}`
      );
    }
  }
}
