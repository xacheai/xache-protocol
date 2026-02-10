/**
 * Budget management and enforcement for Xache Protocol
 * Based on PRD FR-021 and x402-IMPLEMENTATION-DECISIONS.md
 */
import type { BudgetControls } from '@xache/types';
/**
 * Budget status with usage metrics
 */
export interface BudgetStatus {
    currentSpent: string;
    monthlyLimit: string;
    remaining: string;
    percentageUsed: number;
    status: 'healthy' | 'warning' | 'critical' | 'exceeded';
    warnings: string[];
}
/**
 * Check if operation would exceed budget
 */
export declare function wouldExceedBudget(currentSpent: string, operationCost: string, monthlyLimit: string): boolean;
/**
 * Check if budget threshold reached
 */
export declare function checkBudgetThreshold(currentSpent: string, monthlyLimit: string, threshold: number): boolean;
/**
 * Calculate budget status
 */
export declare function calculateBudgetStatus(currentSpent: string, monthlyLimit: string): BudgetStatus;
/**
 * Check if operation should be throttled
 */
export declare function shouldThrottle(currentSpent: string, monthlyLimit: string): boolean;
/**
 * Check if operation should be blocked (hard stop)
 */
export declare function shouldBlockOperation(currentSpent: string, operationCost: string, monthlyLimit: string): boolean;
/**
 * Validate budget allocation
 */
export declare function validateBudgetAllocation(amount: string): {
    valid: boolean;
    error?: string;
};
/**
 * Initialize default budget controls
 */
export declare function initializeBudgetControls(): BudgetControls;
/**
 * Update budget after operation
 */
export declare function updateBudget(current: BudgetControls, operationCost: string): BudgetControls;
/**
 * Reset monthly budget
 */
export declare function resetMonthlyBudget(current: BudgetControls): BudgetControls;
/**
 * Check if budget should be reset (monthly cycle)
 */
export declare function shouldResetBudget(lastResetDate: string): boolean;
/**
 * Calculate projected monthly spend
 */
export declare function calculateProjectedSpend(currentSpent: string, daysElapsed: number): string;
/**
 * Get budget recommendations based on usage
 */
export declare function getBudgetRecommendations(currentSpent: string, monthlyLimit: string, daysElapsed: number): {
    status: string;
    recommendation: string;
    projectedSpend: string;
};
/**
 * Calculate grace period remaining
 */
export declare function calculateGraceRemaining(currentSpent: string, monthlyLimit: string): string;
//# sourceMappingURL=budget.d.ts.map