/**
 * Reputation calculation engine for Xache Protocol
 * Based on HLD Section 5.2 (Native Reputation System)
 */

import {
  REPUTATION_MULTIPLIERS,
  REPUTATION_LIMITS,
  getReputationMultiplier,
} from '@xache/constants';

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
  lastUpdated: number; // Unix timestamp
}

/**
 * Calculate reputation score based on performance metrics
 * Formula: weighted average of success rate, contribution value, and consistency
 */
export function calculateReputationScore(metrics: ReputationMetrics): number {
  const {
    totalOperations,
    successfulOperations,
    failedOperations,
    totalContributionValue,
    avgResponseTime,
    daysSinceLastActivity,
  } = metrics;

  // Not enough data to establish reputation
  if (totalOperations < REPUTATION_LIMITS.MIN_OPERATIONS_FOR_REPUTATION) {
    return REPUTATION_LIMITS.MIN_REPUTATION_SCORE;
  }

  // 1. Success Rate (40% weight)
  const successRate = successfulOperations / totalOperations;
  const successScore = successRate * 0.4;

  // 2. Contribution Value (30% weight)
  // Normalize contribution value to 0-1 scale
  // $10 in contributions = 1.0 score
  const contributionScore = Math.min(totalContributionValue / 10, 1.0) * 0.3;

  // 3. Response Time Performance (20% weight)
  // Faster response time = higher score
  // Target: <1000ms = 1.0, >5000ms = 0.0
  const responseScore = Math.max(0, 1 - avgResponseTime / 5000) * 0.2;

  // 4. Consistency/Activity (10% weight)
  // Penalize inactivity
  const decayAmount = daysSinceLastActivity * REPUTATION_LIMITS.REPUTATION_DECAY_RATE_DAILY;
  const activityScore = Math.max(0, 1 - decayAmount) * 0.1;

  // Combine scores
  let finalScore = successScore + contributionScore + responseScore + activityScore;

  // Clamp to valid range
  finalScore = Math.max(
    REPUTATION_LIMITS.MIN_REPUTATION_SCORE,
    Math.min(finalScore, REPUTATION_LIMITS.MAX_REPUTATION_SCORE)
  );

  return parseFloat(finalScore.toFixed(4));
}

/**
 * Calculate reputation decay based on inactivity
 */
export function calculateReputationDecay(
  currentScore: number,
  daysSinceLastActivity: number
): number {
  if (daysSinceLastActivity <= 0) {
    return currentScore;
  }

  // Reset to 0 if inactive beyond max decay period
  if (daysSinceLastActivity >= REPUTATION_LIMITS.MAX_REPUTATION_DECAY_DAYS) {
    return REPUTATION_LIMITS.MIN_REPUTATION_SCORE;
  }

  // Apply daily decay rate
  const decayAmount = daysSinceLastActivity * REPUTATION_LIMITS.REPUTATION_DECAY_RATE_DAILY;
  const newScore = Math.max(
    REPUTATION_LIMITS.MIN_REPUTATION_SCORE,
    currentScore - decayAmount
  );

  return parseFloat(newScore.toFixed(4));
}

/**
 * Calculate reputation boost from contribution
 */
export function calculateContributionBoost(
  currentScore: number,
  contributionValueUSD: number
): number {
  // Must meet minimum contribution value
  if (contributionValueUSD < REPUTATION_LIMITS.MIN_CONTRIBUTION_VALUE_USD) {
    return currentScore;
  }

  // Boost proportional to contribution value, capped at max
  const boostAmount = Math.min(
    contributionValueUSD / 10 * REPUTATION_LIMITS.MAX_REPUTATION_BOOST_PER_CONTRIBUTION,
    REPUTATION_LIMITS.MAX_REPUTATION_BOOST_PER_CONTRIBUTION
  );

  const newScore = Math.min(
    REPUTATION_LIMITS.MAX_REPUTATION_SCORE,
    currentScore + boostAmount
  );

  return parseFloat(newScore.toFixed(4));
}

/**
 * Get reputation tier based on score
 */
export function getReputationTier(
  score: number
): keyof typeof REPUTATION_MULTIPLIERS {
  if (score >= 0.8) return 'TIER_5';
  if (score >= 0.6) return 'TIER_4';
  if (score >= 0.4) return 'TIER_3';
  if (score >= 0.2) return 'TIER_2';
  return 'TIER_1';
}

/**
 * Update reputation scores based on operation result
 */
export function updateReputationScores(
  current: ReputationScores,
  operationSuccess: boolean,
  responseTimeMs: number
): ReputationScores {
  const metrics: ReputationMetrics = {
    totalOperations: current.totalOperations + 1,
    successfulOperations: operationSuccess
      ? current.successfulOperations + 1
      : current.successfulOperations,
    failedOperations: operationSuccess
      ? current.failedOperations
      : current.failedOperations + 1,
    totalContributionValue: current.totalContributionValue,
    avgResponseTime: current.avgResponseTime,
    daysSinceLastActivity: 0, // Activity just happened
  };

  // Update average response time (exponential moving average)
  metrics.avgResponseTime =
    current.avgResponseTime * 0.9 + responseTimeMs * 0.1;

  // Recalculate overall score
  const overallScore = calculateReputationScore(metrics);

  return {
    overallScore,
    totalOperations: metrics.totalOperations,
    successfulOperations: metrics.successfulOperations,
    failedOperations: metrics.failedOperations,
    totalContributionValue: metrics.totalContributionValue,
    avgResponseTime: metrics.avgResponseTime,
    lastUpdated: Math.floor(Date.now() / 1000),
  };
}

/**
 * Calculate price adjustment based on reputation
 */
export function calculatePriceAdjustment(
  basePrice: string,
  reputationScore: number
): string {
  const multiplier = getReputationMultiplier(reputationScore);
  const adjusted = parseFloat(basePrice) * multiplier;
  return adjusted.toFixed(6);
}

/**
 * Check if agent is eligible for reputation-based discount
 */
export function isEligibleForDiscount(reputationScore: number): boolean {
  return reputationScore < 0.4;
}

/**
 * Check if agent is in premium tier
 */
export function isPremiumTier(reputationScore: number): boolean {
  return reputationScore >= 0.6;
}

/**
 * Get reputation status summary
 */
export function getReputationStatus(score: number): {
  tier: string;
  multiplier: number;
  status: 'new' | 'growing' | 'established' | 'trusted' | 'elite';
  discount: boolean;
  premium: boolean;
} {
  const tier = getReputationTier(score);
  const multiplier = getReputationMultiplier(score);

  let status: 'new' | 'growing' | 'established' | 'trusted' | 'elite';
  if (score < 0.2) status = 'new';
  else if (score < 0.4) status = 'growing';
  else if (score < 0.6) status = 'established';
  else if (score < 0.8) status = 'trusted';
  else status = 'elite';

  return {
    tier,
    multiplier,
    status,
    discount: isEligibleForDiscount(score),
    premium: isPremiumTier(score),
  };
}
