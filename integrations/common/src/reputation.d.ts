/**
 * Reputation calculation engine for Xache Protocol
 * Based on HLD Section 5.2 (Native Reputation System)
 */
import { REPUTATION_MULTIPLIERS } from '@xache/constants';
/**
 * Reputation metrics for calculation
 */
export interface ReputationMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    totalContributionValue: number;
    avgResponseTime: number;
    daysSinceLastActivity: number;
}
/**
 * Reputation scores tracked in the system
 */
export interface ReputationScores {
    overallScore: number;
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    totalContributionValue: number;
    avgResponseTime: number;
    lastUpdated: number;
}
/**
 * Calculate reputation score based on performance metrics
 * Formula: weighted average of success rate, contribution value, and consistency
 */
export declare function calculateReputationScore(metrics: ReputationMetrics): number;
/**
 * Calculate reputation decay based on inactivity
 */
export declare function calculateReputationDecay(currentScore: number, daysSinceLastActivity: number): number;
/**
 * Calculate reputation boost from contribution
 */
export declare function calculateContributionBoost(currentScore: number, contributionValueUSD: number): number;
/**
 * Get reputation tier based on score
 */
export declare function getReputationTier(score: number): keyof typeof REPUTATION_MULTIPLIERS;
/**
 * Update reputation scores based on operation result
 */
export declare function updateReputationScores(current: ReputationScores, operationSuccess: boolean, responseTimeMs: number): ReputationScores;
/**
 * Calculate price adjustment based on reputation
 */
export declare function calculatePriceAdjustment(basePrice: string, reputationScore: number): string;
/**
 * Check if agent is eligible for reputation-based discount
 */
export declare function isEligibleForDiscount(reputationScore: number): boolean;
/**
 * Check if agent is in premium tier
 */
export declare function isPremiumTier(reputationScore: number): boolean;
/**
 * Get reputation status summary
 */
export declare function getReputationStatus(score: number): {
    tier: string;
    multiplier: number;
    status: 'new' | 'growing' | 'established' | 'trusted' | 'elite';
    discount: boolean;
    premium: boolean;
};
//# sourceMappingURL=reputation.d.ts.map