/**
 * Budget Service
 * Manage monthly spending budgets with alert support per HLD §2.2 Budget Guardian
 */

import type { XacheClient } from '../XacheClient';
import type { BudgetStatus, BudgetAlert, BudgetAlertHandler } from '../types';
import { BudgetAlertLevel } from '../types';

/**
 * Budget service for spending management with proactive alerts
 */
export class BudgetService {
  private alertHandlers: BudgetAlertHandler[] = [];
  private lastAlertedThreshold: number = 0;
  private readonly DEFAULT_THRESHOLDS = [50, 80, 100]; // Per HLD §2.2

  constructor(private readonly client: XacheClient) {}

  /**
   * Get current budget status and check alert thresholds
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * const budget = await client.budget.getStatus();
   *
   * console.log(`Limit: $${budget.limitCents / 100}`);
   * console.log(`Spent: $${budget.spentCents / 100}`);
   * console.log(`Remaining: $${budget.remainingCents / 100}`);
   * console.log(`Usage: ${budget.percentageUsed.toFixed(1)}%`);
   * ```
   */
  async getStatus(): Promise<BudgetStatus> {
    // Make API request (authenticated, no payment)
    const response = await this.client.request<BudgetStatus>(
      'GET',
      '/v1/budget'
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to get budget status');
    }

    const status = response.data;

    // Check for budget alerts per HLD §2.2
    await this.checkAndTriggerAlerts(status);

    return status;
  }

  /**
   * Update monthly budget limit
   * Free (no payment required)
   *
   * @example
   * ```typescript
   * // Set limit to $50/month
   * await client.budget.updateLimit(5000);
   *
   * const status = await client.budget.getStatus();
   * console.log('New limit:', status.limitCents / 100);
   * ```
   */
  async updateLimit(limitCents: number): Promise<{ limitCents: number; updated: boolean }> {
    // Validate limit
    this.validateLimit(limitCents);

    // Make API request (authenticated, no payment)
    const response = await this.client.request<{ limitCents: number; updated: boolean }>(
      'PUT',
      '/v1/budget',
      { limitCents }
    );

    if (!response.success || !response.data) {
      throw new Error('Failed to update budget limit');
    }

    return response.data;
  }

  /**
   * Check if operation is within budget
   * Utility method for client-side budget checks
   *
   * @param operationCostCents - Cost of operation in cents
   * @returns true if within budget, false otherwise
   */
  async canAfford(operationCostCents: number): Promise<boolean> {
    const status = await this.getStatus();
    return status.remainingCents >= operationCostCents;
  }

  /**
   * Get formatted budget status
   * Utility method for display purposes
   */
  async getFormattedStatus(): Promise<{
    limit: string;
    spent: string;
    remaining: string;
    percentageUsed: string;
  }> {
    const status = await this.getStatus();

    return {
      limit: `$${(status.limitCents / 100).toFixed(2)}`,
      spent: `$${(status.spentCents / 100).toFixed(2)}`,
      remaining: `$${(status.remainingCents / 100).toFixed(2)}`,
      percentageUsed: `${status.percentageUsed.toFixed(1)}%`,
    };
  }

  /**
   * Register an alert handler for budget threshold notifications
   * Per PRD FR-021: Usage Alerts at 50%, 80%, 100%
   *
   * @param handler - Callback function to handle budget alerts
   *
   * @example
   * ```typescript
   * client.budget.onAlert((alert) => {
   *   console.log(`Budget Alert: ${alert.level}`);
   *   console.log(`  Message: ${alert.message}`);
   *   console.log(`  Usage: ${alert.percentageUsed.toFixed(1)}%`);
   *   console.log(`  Remaining: $${alert.remainingCents / 100}`);
   *
   *   if (alert.level === BudgetAlertLevel.CRITICAL_100) {
   *     // Take action - pause operations, notify admin, etc.
   *     console.error('CRITICAL: Budget limit reached!');
   *   }
   * });
   * ```
   */
  onAlert(handler: BudgetAlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get all currently active budget alerts
   *
   * @returns Array of active alerts based on current budget status
   *
   * @example
   * ```typescript
   * const activeAlerts = await client.budget.getActiveAlerts();
   * if (activeAlerts.length > 0) {
   *   console.log(`${activeAlerts.length} active budget alerts`);
   *   activeAlerts.forEach(alert => {
   *     console.log(`- ${alert.level}: ${alert.message}`);
   *   });
   * }
   * ```
   */
  async getActiveAlerts(): Promise<BudgetAlert[]> {
    const status = await this.getStatus();
    return this.checkThresholds(status);
  }

  /**
   * Check if a specific threshold has been crossed
   *
   * @param threshold - Threshold percentage to check (50, 80, or 100)
   * @returns true if threshold has been crossed
   *
   * @example
   * ```typescript
   * if (await client.budget.isThresholdCrossed(80)) {
   *   console.log('80% budget threshold crossed!');
   * }
   * ```
   */
  async isThresholdCrossed(threshold: number): Promise<boolean> {
    const status = await this.getStatus();
    return status.percentageUsed >= threshold;
  }

  /**
   * Check budget thresholds and return active alerts
   */
  private checkThresholds(status: BudgetStatus): BudgetAlert[] {
    const alerts: BudgetAlert[] = [];

    for (const threshold of this.DEFAULT_THRESHOLDS) {
      if (status.percentageUsed >= threshold) {
        alerts.push(this.createAlert(status, threshold));
      }
    }

    return alerts;
  }

  /**
   * Check thresholds and trigger alert handlers
   */
  private async checkAndTriggerAlerts(status: BudgetStatus): Promise<void> {
    // Find the highest crossed threshold
    let highestCrossedThreshold = 0;
    for (const threshold of this.DEFAULT_THRESHOLDS) {
      if (status.percentageUsed >= threshold) {
        highestCrossedThreshold = threshold;
      }
    }

    // Only trigger if we've crossed a new threshold
    if (highestCrossedThreshold > this.lastAlertedThreshold) {
      const alert = this.createAlert(status, highestCrossedThreshold);

      // Trigger all registered handlers
      for (const handler of this.alertHandlers) {
        try {
          await handler(alert);
        } catch (error) {
          // Log error but don't throw - allow other handlers to execute
          if (this.client.getConfig().debug) {
            console.error('Budget alert handler error:', error);
          }
        }
      }

      // Update last alerted threshold
      this.lastAlertedThreshold = highestCrossedThreshold;
    }
  }

  /**
   * Create a budget alert object
   */
  private createAlert(status: BudgetStatus, threshold: number): BudgetAlert {
    let level: BudgetAlertLevel;
    let message: string;

    if (threshold >= 100) {
      level = BudgetAlertLevel.CRITICAL_100;
      message = 'CRITICAL: Monthly budget limit reached (100%). Operations may be throttled.';
    } else if (threshold >= 80) {
      level = BudgetAlertLevel.WARN_80;
      message = 'WARNING: Approaching budget limit (80%). Consider reviewing spending or increasing limit.';
    } else {
      level = BudgetAlertLevel.WARN_50;
      message = 'NOTICE: Half of monthly budget consumed (50%). Monitor spending closely.';
    }

    return {
      level,
      threshold,
      percentageUsed: status.percentageUsed,
      spentCents: status.spentCents,
      limitCents: status.limitCents,
      remainingCents: status.remainingCents,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate budget limit
   */
  private validateLimit(limitCents: number): void {
    if (typeof limitCents !== 'number') {
      throw new Error('limitCents must be a number');
    }

    if (limitCents < 0) {
      throw new Error('limitCents must be non-negative');
    }

    if (limitCents > 1000000) {
      // Max $10,000/month
      throw new Error('limitCents cannot exceed 1,000,000 ($10,000)');
    }

    if (!Number.isInteger(limitCents)) {
      throw new Error('limitCents must be an integer');
    }
  }

  // ========== Fleet Budget (Owner Only) ==========

  /**
   * Get fleet budget status for authenticated owner
   * Returns aggregated spending across all owned agents
   * Requires owner authentication (did:owner:...)
   *
   * @example
   * ```typescript
   * const fleet = await client.budget.getFleetStatus();
   *
   * console.log('Fleet Cap:', fleet.fleetBudgetCapUSD);
   * console.log('Total Spent:', fleet.totalSpentUSD);
   * console.log('Usage:', fleet.percentageUsed?.toFixed(1) + '%');
   *
   * fleet.agents.forEach(agent => {
   *   console.log(`  ${agent.name}: $${agent.spentCents / 100}`);
   * });
   * ```
   */
  async getFleetStatus(): Promise<FleetBudgetStatus> {
    const response = await this.client.request<FleetBudgetStatus>(
      'GET',
      '/v1/budget/fleet'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get fleet budget status');
    }

    return response.data;
  }

  /**
   * Update fleet budget cap for authenticated owner
   * Set to null for unlimited
   * Requires owner authentication (did:owner:...)
   *
   * @param fleetCapCents - Budget cap in cents, or null for unlimited
   *
   * @example
   * ```typescript
   * // Set fleet cap to $500
   * await client.budget.updateFleetCap(50000);
   *
   * // Remove fleet cap (unlimited)
   * await client.budget.updateFleetCap(null);
   * ```
   */
  async updateFleetCap(fleetCapCents: number | null): Promise<{
    ownerDID: string;
    fleetBudgetCapCents: number | null;
    updated: boolean;
  }> {
    // Validate input
    if (fleetCapCents !== null) {
      if (typeof fleetCapCents !== 'number' || fleetCapCents < 0) {
        throw new Error('fleetCapCents must be a positive number or null');
      }
    }

    const response = await this.client.request<{
      ownerDID: string;
      fleetBudgetCapCents: number | null;
      updated: boolean;
    }>('PUT', '/v1/budget/fleet', { fleetCapCents });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to update fleet budget cap');
    }

    return response.data;
  }
}

/**
 * Fleet budget status for owners
 */
export interface FleetBudgetStatus {
  ownerDID: string;
  fleetBudgetCapCents: number | null;
  fleetBudgetCapUSD: string | null;
  totalSpentCents: number;
  totalSpentUSD: string;
  remainingCents: number | null;
  remainingUSD: string | null;
  percentageUsed: number | null;
  agentCount: number;
  totalAgentLimitsCents: number;
  agents: Array<{
    agentDID: string;
    name: string;
    spentCents: number;
    limitCents: number;
  }>;
}
