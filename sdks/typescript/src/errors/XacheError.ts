/**
 * Custom error classes for Xache SDK
 * Maps to API error codes per LLD §2.1
 */

import type { ErrorCode } from '../types';

/**
 * Base Xache error class
 */
export class XacheError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message);
    this.name = 'XacheError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, XacheError);
    }
  }
}

/**
 * Authentication error (401)
 */
export class UnauthenticatedError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('UNAUTHENTICATED', message, 401, details, requestId);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Payment required error (402)
 */
export class PaymentRequiredError extends XacheError {
  public readonly challengeId: string;
  public readonly amount: string;
  public readonly chainHint: 'solana' | 'base';
  public readonly payTo: string;
  public readonly description: string;
  public readonly resource: string;

  constructor(
    message: string,
    challengeId: string,
    amount: string,
    chainHint: 'solana' | 'base',
    payTo: string,
    description: string,
    requestId?: string,
    resource?: string
  ) {
    super('PAYMENT_REQUIRED', message, 402, { challengeId, amount, chainHint, payTo, description, resource }, requestId);
    this.name = 'PaymentRequiredError';
    this.challengeId = challengeId;
    this.amount = amount;
    this.chainHint = chainHint;
    this.payTo = payTo;
    this.description = description;
    this.resource = resource || '';
  }
}

/**
 * Rate limited error (429)
 */
export class RateLimitedError extends XacheError {
  public readonly resetAt?: string;

  constructor(message: string, resetAt?: string, details?: Record<string, unknown>, requestId?: string) {
    super('RATE_LIMITED', message, 429, { ...details, resetAt }, requestId);
    this.name = 'RateLimitedError';
    this.resetAt = resetAt;
  }
}

/**
 * Budget exceeded error (400)
 */
export class BudgetExceededError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('BUDGET_EXCEEDED', message, 400, details, requestId);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Invalid input error (400)
 */
export class InvalidInputError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('INVALID_INPUT', message, 400, details, requestId);
    this.name = 'InvalidInputError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('CONFLICT', message, 409, details, requestId);
    this.name = 'ConflictError';
  }
}

/**
 * Retry later error (503)
 */
export class RetryLaterError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('RETRY_LATER', message, 503, details, requestId);
    this.name = 'RetryLaterError';
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends XacheError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('INTERNAL', message, 500, details, requestId);
    this.name = 'InternalError';
  }
}

/**
 * Network error (not from API)
 */
export class NetworkError extends Error {
  public readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

/**
 * Create appropriate error from API response
 */
export function createErrorFromResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>,
  requestId?: string
): XacheError {
  switch (code) {
    case 'UNAUTHENTICATED':
      return new UnauthenticatedError(message, details, requestId);
    case 'RATE_LIMITED':
      return new RateLimitedError(message, details?.resetAt as string, details, requestId);
    case 'BUDGET_EXCEEDED':
      return new BudgetExceededError(message, details, requestId);
    case 'INVALID_INPUT':
      return new InvalidInputError(message, details, requestId);
    case 'CONFLICT':
      return new ConflictError(message, details, requestId);
    case 'RETRY_LATER':
      return new RetryLaterError(message, details, requestId);
    case 'INTERNAL':
      return new InternalError(message, details, requestId);
    default:
      return new XacheError(code, message, statusCode, details, requestId);
  }
}
