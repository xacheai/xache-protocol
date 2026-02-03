/**
 * Retry utility with exponential backoff
 * Production-ready automatic error recovery
 */

import type { RetryPolicy, ErrorCode, APIResponse } from '../types';

const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
  retryableErrors: ['RETRY_LATER', 'INTERNAL'],
  timeout: 60000,
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(
  error: unknown,
  retryableErrors: ErrorCode[]
): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { code?: ErrorCode };
  return retryableErrors.includes(err.code as ErrorCode);
}

/**
 * Execute function with automatic retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = {},
  debug = false
): Promise<T> {
  const config: Required<RetryPolicy> = {
    ...DEFAULT_RETRY_POLICY,
    ...policy,
    backoffMs: policy.backoffMs || DEFAULT_RETRY_POLICY.backoffMs,
    retryableErrors: policy.retryableErrors || DEFAULT_RETRY_POLICY.retryableErrors,
  };

  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (Date.now() - startTime > config.timeout) {
      throw new Error(
        `Operation timed out after ${config.timeout}ms (${attempt} attempts)`
      );
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === config.maxRetries) {
        break;
      }

      if (!isRetryableError(error, config.retryableErrors)) {
        throw error;
      }

      const delay = config.backoffMs[attempt] || config.backoffMs[config.backoffMs.length - 1];

      if (debug) {
        console.log(
          `Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms delay`
        );
      }

      await sleep(delay);
    }
  }

  throw lastError;
}
