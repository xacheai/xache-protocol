/**
 * Budget management and enforcement for Xache Protocol
 * Based on PRD FR-021 and x402-IMPLEMENTATION-DECISIONS.md
 */
import { BUDGET_DEFAULTS, ECONOMIC_LIMITS } from '@xache/constants';
/**
 * Check if operation would exceed budget
 */
export function wouldExceedBudget(currentSpent, operationCost, monthlyLimit) {
    const spent = parseFloat(currentSpent);
    const cost = parseFloat(operationCost);
    const limit = parseFloat(monthlyLimit);
    return spent + cost > limit;
}
/**
 * Check if budget threshold reached
 */
export function checkBudgetThreshold(currentSpent, monthlyLimit, threshold) {
    const spent = parseFloat(currentSpent);
    const limit = parseFloat(monthlyLimit);
    if (limit === 0)
        return false;
    return spent / limit >= threshold;
}
/**
 * Calculate budget status
 */
export function calculateBudgetStatus(currentSpent, monthlyLimit) {
    const spent = parseFloat(currentSpent);
    const limit = parseFloat(monthlyLimit);
    const remaining = Math.max(0, limit - spent);
    const percentageUsed = limit > 0 ? spent / limit : 0;
    // Determine status
    let status;
    if (percentageUsed >= BUDGET_DEFAULTS.HARD_STOP_THRESHOLD) {
        status = 'exceeded';
    }
    else if (percentageUsed >= BUDGET_DEFAULTS.AUTO_THROTTLE_THRESHOLD) {
        status = 'critical';
    }
    else if (percentageUsed >= BUDGET_DEFAULTS.WARNING_THRESHOLDS[1]) {
        status = 'warning';
    }
    else {
        status = 'healthy';
    }
    // Determine warnings
    const warnings = [];
    if (percentageUsed >= BUDGET_DEFAULTS.WARNING_THRESHOLDS[0]) {
        warnings.push('50% budget used');
    }
    if (percentageUsed >= BUDGET_DEFAULTS.WARNING_THRESHOLDS[1]) {
        warnings.push('80% budget used');
    }
    if (percentageUsed >= BUDGET_DEFAULTS.AUTO_THROTTLE_THRESHOLD) {
        warnings.push('Auto-throttle active');
    }
    if (percentageUsed >= BUDGET_DEFAULTS.HARD_STOP_THRESHOLD) {
        warnings.push('Budget limit reached');
    }
    return {
        currentSpent: spent.toFixed(6),
        monthlyLimit: limit.toFixed(2),
        remaining: remaining.toFixed(6),
        percentageUsed: parseFloat((percentageUsed * 100).toFixed(2)),
        status,
        warnings,
    };
}
/**
 * Check if operation should be throttled
 */
export function shouldThrottle(currentSpent, monthlyLimit) {
    return checkBudgetThreshold(currentSpent, monthlyLimit, BUDGET_DEFAULTS.AUTO_THROTTLE_THRESHOLD);
}
/**
 * Check if operation should be blocked (hard stop)
 */
export function shouldBlockOperation(currentSpent, operationCost, monthlyLimit) {
    const spent = parseFloat(currentSpent);
    const cost = parseFloat(operationCost);
    const limit = parseFloat(monthlyLimit);
    const graceAmount = parseFloat(BUDGET_DEFAULTS.GRACE_OVERAGE_USD);
    // Block if would exceed limit + grace
    return spent + cost > limit + graceAmount;
}
/**
 * Validate budget allocation
 */
export function validateBudgetAllocation(amount) {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
        return { valid: false, error: 'Invalid budget amount' };
    }
    const minBudget = parseFloat(ECONOMIC_LIMITS.MIN_BUDGET_USD);
    const maxBudget = parseFloat(ECONOMIC_LIMITS.MAX_BUDGET_USD);
    if (parsed < minBudget) {
        return {
            valid: false,
            error: `Budget below minimum of ${ECONOMIC_LIMITS.MIN_BUDGET_USD}`,
        };
    }
    if (parsed > maxBudget) {
        return {
            valid: false,
            error: `Budget exceeds maximum of ${ECONOMIC_LIMITS.MAX_BUDGET_USD}`,
        };
    }
    return { valid: true };
}
/**
 * Initialize default budget controls
 */
export function initializeBudgetControls() {
    return {
        monthlyLimit: BUDGET_DEFAULTS.MONTHLY_LIMIT_USD,
        currentSpend: '0.00',
        alertThresholds: [...BUDGET_DEFAULTS.WARNING_THRESHOLDS], // Cast readonly to mutable
        autoThrottle: true,
        resetDate: new Date().toISOString(), // ISO8601
    };
}
/**
 * Update budget after operation
 */
export function updateBudget(current, operationCost) {
    const currentSpend = parseFloat(current.currentSpend);
    const cost = parseFloat(operationCost);
    const newSpend = currentSpend + cost;
    return {
        ...current,
        currentSpend: newSpend.toFixed(6),
    };
}
/**
 * Reset monthly budget
 */
export function resetMonthlyBudget(current) {
    return {
        ...current,
        currentSpend: '0.00',
        resetDate: new Date().toISOString(),
    };
}
/**
 * Check if budget should be reset (monthly cycle)
 */
export function shouldResetBudget(lastResetDate) {
    const lastReset = new Date(lastResetDate);
    const now = new Date();
    // Reset if in different month
    return (lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear());
}
/**
 * Calculate projected monthly spend
 */
export function calculateProjectedSpend(currentSpent, daysElapsed) {
    if (daysElapsed === 0)
        return currentSpent;
    const spent = parseFloat(currentSpent);
    const dailyAverage = spent / daysElapsed;
    const daysInMonth = 30; // Approximate
    const projected = dailyAverage * daysInMonth;
    return projected.toFixed(2);
}
/**
 * Get budget recommendations based on usage
 */
export function getBudgetRecommendations(currentSpent, monthlyLimit, daysElapsed) {
    const status = calculateBudgetStatus(currentSpent, monthlyLimit);
    const projected = calculateProjectedSpend(currentSpent, daysElapsed);
    const projectedNum = parseFloat(projected);
    const limitNum = parseFloat(monthlyLimit);
    let recommendation;
    if (status.status === 'exceeded') {
        recommendation = 'Budget exceeded. Consider increasing monthly limit or reducing usage.';
    }
    else if (status.status === 'critical') {
        recommendation = 'Critical: Budget nearly exhausted. Operations are being throttled.';
    }
    else if (projectedNum > limitNum * 1.1) {
        recommendation = `Warning: Projected spend ($${projected}) exceeds budget by ${((projectedNum / limitNum - 1) * 100).toFixed(0)}%. Consider increasing limit.`;
    }
    else if (projectedNum < limitNum * 0.5) {
        recommendation = `Budget is underutilized. Consider reducing limit to $${projected} to optimize.`;
    }
    else {
        recommendation = 'Budget is healthy and on track.';
    }
    return {
        status: status.status,
        recommendation,
        projectedSpend: projected,
    };
}
/**
 * Calculate grace period remaining
 */
export function calculateGraceRemaining(currentSpent, monthlyLimit) {
    const spent = parseFloat(currentSpent);
    const limit = parseFloat(monthlyLimit);
    const graceAmount = parseFloat(BUDGET_DEFAULTS.GRACE_OVERAGE_USD);
    if (spent <= limit) {
        return graceAmount.toFixed(2);
    }
    const graceUsed = spent - limit;
    const graceRemaining = Math.max(0, graceAmount - graceUsed);
    return graceRemaining.toFixed(2);
}
//# sourceMappingURL=budget.js.map