/**
 * Dynamic pricing engine for Xache Protocol
 * Based on PRD Economic Model and HLD Section 5.2
 */
import { OPERATION_PRICES } from '@xache/constants';
import type { NetworkId } from '@xache/types';
/**
 * Calculate operation price with reputation adjustment
 */
export declare function calculateOperationPrice(operation: keyof typeof OPERATION_PRICES, reputationScore: number, domainBonus?: number): {
    basePrice: string;
    adjustedPrice: string;
    reputationMultiplier: number;
    domainBonus: number;
};
/**
 * Calculate batch discount
 */
export declare function calculateBatchDiscount(singlePrice: string, batchSize: number): {
    totalPrice: string;
    perItemPrice: string;
    discountPercentage: number;
};
/**
 * Calculate royalty payment
 */
export declare function calculateRoyalty(queryPrice: string, contributorReputationScore: number): {
    royaltyAmount: string;
    royaltyRate: number;
    netPrice: string;
};
/**
 * Select optimal chain based on transaction amount and gas prices
 */
export declare function selectOptimalChain(amountUSD: string, currentGasGwei?: number): {
    preferredChain: 'base' | 'solana';
    reason: string;
};
/**
 * Calculate total cost with gas estimation
 */
export declare function calculateTotalCost(operationPrice: string, networkId: NetworkId, gasMultiplier?: number): {
    operationCost: string;
    estimatedGasCost: string;
    totalCost: string;
};
/**
 * Calculate collective query pricing with royalty distribution
 */
export declare function calculateCollectiveQueryPrice(reputationScore: number, contributorCount: number, contributorReputations: number[]): {
    basePrice: string;
    adjustedPrice: string;
    royaltyDistribution: Array<{
        contributorIndex: number;
        reputationScore: number;
        royaltyAmount: string;
        royaltyRate: number;
    }>;
    protocolRevenue: string;
};
/**
 * Calculate storage tier pricing
 * Different pricing for hot/warm/cold tiers
 */
export declare function calculateStorageTierPrice(tier: 'hot' | 'warm' | 'cold', basePrice: string): {
    tierPrice: string;
    multiplier: number;
};
/**
 * Calculate domain bonus (expertise in specific domains)
 */
export declare function calculateDomainBonus(domainExpertiseScore: number): number;
/**
 * Get pricing summary for display
 */
export declare function getPricingSummary(operation: keyof typeof OPERATION_PRICES, reputationScore: number, options?: {
    batchSize?: number;
    networkId?: NetworkId;
    domainBonus?: number;
}): {
    operation: string;
    basePrice: string;
    adjustments: Array<{
        type: string;
        description: string;
        amount: string;
    }>;
    finalPrice: string;
};
//# sourceMappingURL=pricing.d.ts.map