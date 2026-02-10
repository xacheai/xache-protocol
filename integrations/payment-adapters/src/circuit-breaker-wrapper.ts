/**
 * Circuit Breaker Wrapper for Payment Adapters
 * Protects against cascading failures from external payment services
 */

import { CircuitBreaker, createCircuitBreaker } from '@xache/utils';

// Global circuit breakers for each external service
const breakers = new Map<string, CircuitBreaker>();

/**
 * Get or create circuit breaker for a service
 */
export function getCircuitBreaker(serviceName: string): CircuitBreaker {
  if (!breakers.has(serviceName)) {
    breakers.set(serviceName, createCircuitBreaker());
  }
  return breakers.get(serviceName)!;
}

/**
 * Execute payment operation with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>
): Promise<T> {
  const breaker = getCircuitBreaker(serviceName);
  return await breaker.execute(operation);
}

/**
 * Reset circuit breaker (for manual recovery)
 */
export function resetCircuitBreaker(serviceName: string): void {
  const breaker = breakers.get(serviceName);
  if (breaker) {
    breaker.reset();
  }
}

/**
 * Get circuit breaker state for monitoring
 */
export function getCircuitBreakerState(serviceName: string): string {
  const breaker = breakers.get(serviceName);
  return breaker ? breaker.getState() : 'CLOSED';
}
