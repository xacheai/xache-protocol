/**
 * AutoContributeService
 * Automatically contributes high-confidence extracted insights to the collective
 *
 * Per LLD §15 - Addendum A: Auto-Contribute Implementation
 */

import type {
  AutoContributeConfig,
  AutoContribution,
  AutoContributeState,
  AutoContributeSkipReason,
  AutoContributeResult,
  ContributionOpportunity,
  ExtractedMemory,
} from '../types';
import type { CollectiveService } from './CollectiveService';
import type { ReputationService } from './ReputationService';
import type { DID } from '../types';

const DOCS_URL = 'https://docs.xache.io/auto-contribute';

const DEFAULT_CONFIG = {
  enabled: false,
  confidenceThreshold: 0.8,
  minReputation: 0.5,
  delayHours: 0,
  maxPerDay: 50,
};

/**
 * Service for automatic contribution of high-quality extracted insights
 * to the collective intelligence network.
 *
 * @example
 * ```typescript
 * const service = new AutoContributeService(
 *   { enabled: true, confidenceThreshold: 0.85 },
 *   collectiveService,
 *   reputationService,
 *   'did:agent:sol:...'
 * );
 *
 * const result = await service.evaluate(extractions, 'extraction_123');
 * console.log('Contributed:', result.contributed.length);
 * ```
 */
export class AutoContributeService {
  private config: AutoContributeConfig;
  private state: AutoContributeState;
  private collectiveService: CollectiveService;
  private reputationService: ReputationService;
  private agentDID: DID;
  private debug: boolean;

  constructor(
    config: AutoContributeConfig,
    collectiveService: CollectiveService,
    reputationService: ReputationService,
    agentDID: DID,
    debug = false
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.collectiveService = collectiveService;
    this.reputationService = reputationService;
    this.agentDID = agentDID;
    this.debug = debug;
    this.state = {
      contributionsToday: 0,
      lastContributionAt: 0,
      dayStartedAt: this.getDayStart(),
      contributedHashes: new Set(),
      pendingDelayed: [],
    };

    if (this.debug) {
      console.log('[AutoContribute] Initialized:', {
        enabled: this.config.enabled,
        confidenceThreshold: this.config.confidenceThreshold,
        maxPerDay: this.config.maxPerDay,
      });
    }
  }

  /**
   * Evaluate extractions and auto-contribute if enabled and qualified
   */
  async evaluate(
    extractions: ExtractedMemory[],
    extractionId?: string
  ): Promise<AutoContributeResult> {
    const contributed: AutoContribution[] = [];
    const skipped: Array<{ extraction: ExtractedMemory; reason: AutoContributeSkipReason }> = [];

    // Reset daily counter if new day
    this.maybeResetDailyCounter();

    // If disabled, return opportunity hint for qualified insights
    if (!this.config.enabled) {
      const qualified = extractions.filter(e => this.isQualified(e).qualified);
      return {
        contributed: [],
        skipped: extractions.map(e => ({ extraction: e, reason: 'disabled' as const })),
        opportunity: qualified.length > 0 ? this.buildOpportunity(qualified) : undefined,
      };
    }

    // Get agent reputation once
    let agentReputation: number;
    try {
      const repSnapshot = await this.reputationService.getReputation(this.agentDID);
      agentReputation = repSnapshot?.overall ?? 0;
    } catch (error) {
      if (this.debug) {
        console.log('[AutoContribute] Failed to get reputation, using 0:', error);
      }
      agentReputation = 0;
    }

    // Evaluate each extraction
    for (const extraction of extractions) {
      const { qualified, reason } = this.isQualified(extraction, agentReputation);

      if (!qualified) {
        skipped.push({ extraction, reason: reason! });
        continue;
      }

      // Check rate limit
      if (this.state.contributionsToday >= (this.config.maxPerDay ?? 50)) {
        skipped.push({ extraction, reason: 'rate_limited' });
        continue;
      }

      // Check duplicate
      const hash = this.hashInsight(extraction);
      if (this.state.contributedHashes.has(hash)) {
        skipped.push({ extraction, reason: 'duplicate' });
        continue;
      }

      // Check delay
      if ((this.config.delayHours ?? 0) > 0) {
        this.state.pendingDelayed.push({
          insight: extraction,
          contributeAt: Date.now() + (this.config.delayHours ?? 0) * 3600 * 1000,
        });
        skipped.push({ extraction, reason: 'delayed' });
        continue;
      }

      // Contribute!
      try {
        const result = await this.contribute(extraction, extractionId);
        contributed.push(result);
        this.state.contributedHashes.add(hash);
        this.state.contributionsToday++;
        this.state.lastContributionAt = Date.now();

        if (this.debug) {
          console.log('[AutoContribute] Contributed:', result.heuristicId);
        }

        // Callback
        if (this.config.onContribute) {
          try {
            this.config.onContribute(result);
          } catch (callbackError) {
            if (this.debug) {
              console.log('[AutoContribute] onContribute callback error:', callbackError);
            }
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error('[AutoContribute] Contribution failed:', error);
        }
        skipped.push({ extraction, reason: 'error' });
      }
    }

    return { contributed, skipped };
  }

  /**
   * Process any delayed contributions that are now ready
   */
  async processDelayed(): Promise<AutoContribution[]> {
    const now = Date.now();
    const ready = this.state.pendingDelayed.filter(p => p.contributeAt <= now);
    this.state.pendingDelayed = this.state.pendingDelayed.filter(p => p.contributeAt > now);

    const contributed: AutoContribution[] = [];
    for (const { insight } of ready) {
      if (this.state.contributionsToday >= (this.config.maxPerDay ?? 50)) break;

      try {
        const result = await this.contribute(insight);
        contributed.push(result);
        this.state.contributionsToday++;

        if (this.config.onContribute) {
          this.config.onContribute(result);
        }
      } catch (error) {
        if (this.debug) {
          console.error('[AutoContribute] Delayed contribution failed:', error);
        }
      }
    }

    return contributed;
  }

  /**
   * Check if an extraction qualifies for contribution
   */
  private isQualified(
    extraction: ExtractedMemory,
    agentReputation?: number
  ): { qualified: boolean; reason?: AutoContributeSkipReason } {
    // Confidence check
    if (extraction.confidence < (this.config.confidenceThreshold ?? 0.8)) {
      return { qualified: false, reason: 'low_confidence' };
    }

    // Reputation check (if we have it)
    if (agentReputation !== undefined && agentReputation < (this.config.minReputation ?? 0.5)) {
      return { qualified: false, reason: 'low_reputation' };
    }

    // Domain checks
    const domain = (extraction.data?.domain as string) || 'general';
    if (domain) {
      if (this.config.excludeDomains?.includes(domain)) {
        return { qualified: false, reason: 'domain_excluded' };
      }
      if (this.config.domains && !this.config.domains.includes(domain)) {
        return { qualified: false, reason: 'domain_not_allowed' };
      }
    }

    return { qualified: true };
  }

  /**
   * Contribute an extraction to the collective
   */
  private async contribute(
    extraction: ExtractedMemory,
    extractionId?: string
  ): Promise<AutoContribution> {
    const domain = (extraction.data?.domain as string) || 'general';

    // Build pattern from extraction data
    const pattern = this.buildPattern(extraction);
    const patternHash = this.hashInsight(extraction);

    const result = await this.collectiveService.contribute({
      domain,
      pattern,
      patternHash,
      tags: this.buildTags(extraction),
      metrics: {
        successRate: extraction.confidence,
        sampleSize: 1,
        confidence: extraction.confidence,
      },
      encryptedContentRef: '', // Will be filled by collective service
      contextType: extraction.type,
      metadata: {
        extractionId,
        autoContributed: true,
        confidence: extraction.confidence,
        reasoning: extraction.reasoning,
      },
    });

    return {
      heuristicId: result.heuristicId,
      domain,
      confidence: extraction.confidence,
      contributedAt: Date.now(),
      extractionId,
    };
  }

  /**
   * Build a pattern string from extraction
   */
  private buildPattern(extraction: ExtractedMemory): string {
    // Create a descriptive pattern from the extraction
    const data = extraction.data || {};
    const dataStr = JSON.stringify(data);

    // Truncate if too long (max 500 chars per LLD)
    if (dataStr.length > 450) {
      return `${extraction.type}: ${dataStr.slice(0, 447)}...`;
    }

    return `${extraction.type}: ${dataStr}`;
  }

  /**
   * Build tags from extraction
   */
  private buildTags(extraction: ExtractedMemory): string[] {
    const tags: string[] = [extraction.type, 'auto-contributed'];

    // Add domain if present
    const domain = extraction.data?.domain as string | undefined;
    if (domain) {
      tags.push(domain);
    }

    // Add suggested method as tag
    if (extraction.suggestedMethod) {
      tags.push(extraction.suggestedMethod);
    }

    return tags.slice(0, 10); // Max 10 tags per LLD
  }

  /**
   * Build opportunity hint for disabled auto-contribute
   */
  private buildOpportunity(qualified: ExtractedMemory[]): ContributionOpportunity {
    return {
      eligibleCount: qualified.length,
      insights: qualified.slice(0, 5).map(e => ({
        domain: (e.data?.domain as string) || 'general',
        confidence: e.confidence,
        heuristicType: e.type,
      })),
      message: `${qualified.length} insight(s) qualify for collective contribution. Enable auto-contribute to earn royalties.`,
      learnMore: DOCS_URL,
    };
  }

  /**
   * Hash insight content for deduplication
   */
  private hashInsight(extraction: ExtractedMemory): string {
    const content = JSON.stringify({
      type: extraction.type,
      data: extraction.data,
    });

    // Simple hash for deduplication (not cryptographic)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Get start of current day (midnight)
   */
  private getDayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  /**
   * Reset daily counter if new day
   */
  private maybeResetDailyCounter(): void {
    const currentDayStart = this.getDayStart();
    if (currentDayStart > this.state.dayStartedAt) {
      if (this.debug) {
        console.log('[AutoContribute] New day, resetting counters');
      }
      this.state.contributionsToday = 0;
      this.state.dayStartedAt = currentDayStart;
      this.state.contributedHashes.clear();
    }
  }

  /**
   * Get current state for debugging/monitoring
   */
  getState(): Readonly<AutoContributeState> {
    return {
      ...this.state,
      contributedHashes: new Set(this.state.contributedHashes),
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<AutoContributeConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.debug) {
      console.log('[AutoContribute] Config updated:', this.config);
    }
  }

  /**
   * Check if auto-contribute is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get remaining contributions for today
   */
  getRemainingContributions(): number {
    this.maybeResetDailyCounter();
    return Math.max(0, (this.config.maxPerDay ?? 50) - this.state.contributionsToday);
  }
}
