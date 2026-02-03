/**
 * Extraction Service
 * Handles memory extraction from agent traces using LLMs
 * Extended with auto-contribute support per LLD §15
 */

import type { XacheClient } from '../XacheClient';
import type {
  LLMConfig,
  ExtractionOptions,
  ExtractedMemory,
  ExtractionResponseV2,
  AutoContributeConfig,
  AutoContribution,
  ContributionOpportunity,
} from '../types';
import { AutoContributeService } from './AutoContributeService';

/**
 * Extraction request parameters
 */
export interface ExtractMemoriesRequest {
  trace: string | object;
  llmConfig: LLMConfig;
  options?: ExtractionOptions;
}

/**
 * Extraction response
 */
export interface ExtractMemoriesResponse {
  extractions: ExtractedMemory[];
  stored?: string[];
  metadata: {
    extractionTime: number;
    llmProvider: string;
    llmModel: string;
    totalExtractions: number;
    storedCount: number;
    paymentReceiptId?: string;
  };
  /** Auto-contributions made (if auto-contribute enabled) */
  autoContributed?: AutoContribution[];
  /** Contribution opportunity hint (if auto-contribute disabled but insights qualify) */
  contributionOpportunity?: ContributionOpportunity;
}

/**
 * Extraction Service
 * Provides memory extraction capabilities with automatic x402 payment handling
 */
export class ExtractionService {
  private autoContributeService?: AutoContributeService;

  constructor(
    private readonly client: XacheClient,
    autoContributeConfig?: AutoContributeConfig
  ) {
    // Initialize auto-contribute if config provided
    if (autoContributeConfig) {
      this.initAutoContribute(autoContributeConfig);
    }
  }

  /**
   * Initialize or update auto-contribute service
   * Called by XacheClient when autoContribute config is provided
   */
  initAutoContribute(config: AutoContributeConfig): void {
    this.autoContributeService = new AutoContributeService(
      config,
      this.client.collective,
      this.client.reputation,
      this.client.getConfig().did,
      this.client.getConfig().debug
    );
  }

  /**
   * Get auto-contribute service for direct access
   */
  getAutoContributeService(): AutoContributeService | undefined {
    return this.autoContributeService;
  }

  /**
   * Extract memories from agent trace using specified LLM
   * Supports three modes:
   * 1. api-key: Your own Anthropic/OpenAI API key (0.001 x402)
   * 2. endpoint: Custom endpoint (Ollama, Replicate, Modal, BYO) (0.001 x402)
   * 3. xache-managed: Xache provides the LLM (0.01 x402)
   *
   * Payment is handled automatically via x402 protocol.
   *
   * @example
   * ```typescript
   * // Using your own API key
   * const result = await client.extraction.extract({
   *   trace: "User: I prefer dark mode\nAgent: I'll remember that",
   *   llmConfig: {
   *     type: 'api-key',
   *     provider: 'anthropic',
   *     apiKey: 'sk-ant-...',
   *   },
   *   options: {
   *     confidenceThreshold: 0.8,
   *     autoStore: true
   *   }
   * });
   *
   * // Using custom endpoint (Ollama)
   * const result = await client.extraction.extract({
   *   trace: agentTrace,
   *   llmConfig: {
   *     type: 'endpoint',
   *     url: 'http://localhost:11434/api/generate',
   *     format: 'ollama',
   *     model: 'llama2'
   *   }
   * });
   *
   * // Using Xache-managed LLM
   * const result = await client.extraction.extract({
   *   trace: scrubbedTrace,
   *   llmConfig: {
   *     type: 'xache-managed',
   *     provider: 'anthropic'
   *   }
   * });
   * ```
   */
  async extract(request: ExtractMemoriesRequest): Promise<ExtractMemoriesResponse> {
    const response = await this.client.request<ExtractionResponseV2>(
      'POST',
      '/v1/extract',
      {
        trace: request.trace,
        llmConfig: request.llmConfig,
        options: request.options,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Extraction failed');
    }

    const data = response.data;

    // Evaluate extractions for auto-contribution
    let autoContributed: AutoContribution[] | undefined;
    let contributionOpportunity: ContributionOpportunity | undefined;

    if (this.autoContributeService && data.extractions.length > 0) {
      const extractionId = data.metadata.paymentReceiptId;
      const result = await this.autoContributeService.evaluate(
        data.extractions,
        extractionId
      );

      if (result.contributed.length > 0) {
        autoContributed = result.contributed;
      }

      if (result.opportunity) {
        contributionOpportunity = result.opportunity;
      }
    }

    return {
      extractions: data.extractions,
      stored: data.stored,
      metadata: data.metadata,
      autoContributed,
      contributionOpportunity,
    };
  }

  /**
   * Extract memories with your own Anthropic API key
   * Convenience method for api-key mode with Anthropic
   *
   * @example
   * ```typescript
   * const result = await client.extraction.extractWithAnthropic({
   *   trace: agentTrace,
   *   apiKey: 'sk-ant-...',
   *   model: 'claude-3-5-sonnet-20241022',
   *   autoStore: true
   * });
   * ```
   */
  async extractWithAnthropic(params: {
    trace: string | object;
    apiKey: string;
    model?: string;
    confidenceThreshold?: number;
    contextHint?: string;
    autoStore?: boolean;
    /** Subject Keys for auto-stored memories (when autoStore=true) */
    subject?: {
      subjectId?: string;
      scope?: 'SUBJECT' | 'SEGMENT' | 'GLOBAL';
      segmentId?: string;
      tenantId?: string;
    };
  }): Promise<ExtractMemoriesResponse> {
    return this.extract({
      trace: params.trace,
      llmConfig: {
        type: 'api-key',
        provider: 'anthropic',
        apiKey: params.apiKey,
        model: params.model,
      },
      options: {
        confidenceThreshold: params.confidenceThreshold,
        contextHint: params.contextHint,
        autoStore: params.autoStore,
        subject: params.subject,
      },
    });
  }

  /**
   * Extract memories with your own OpenAI API key
   * Convenience method for api-key mode with OpenAI
   *
   * @example
   * ```typescript
   * const result = await client.extraction.extractWithOpenAI({
   *   trace: agentTrace,
   *   apiKey: 'sk-...',
   *   model: 'gpt-4-turbo',
   *   autoStore: true
   * });
   * ```
   */
  async extractWithOpenAI(params: {
    trace: string | object;
    apiKey: string;
    model?: string;
    confidenceThreshold?: number;
    contextHint?: string;
    autoStore?: boolean;
    /** Subject Keys for auto-stored memories (when autoStore=true) */
    subject?: {
      subjectId?: string;
      scope?: 'SUBJECT' | 'SEGMENT' | 'GLOBAL';
      segmentId?: string;
      tenantId?: string;
    };
  }): Promise<ExtractMemoriesResponse> {
    return this.extract({
      trace: params.trace,
      llmConfig: {
        type: 'api-key',
        provider: 'openai',
        apiKey: params.apiKey,
        model: params.model,
      },
      options: {
        confidenceThreshold: params.confidenceThreshold,
        contextHint: params.contextHint,
        autoStore: params.autoStore,
        subject: params.subject,
      },
    });
  }

  /**
   * Extract memories using Ollama (local LLM)
   * Convenience method for endpoint mode with Ollama
   *
   * @example
   * ```typescript
   * const result = await client.extraction.extractWithOllama({
   *   trace: agentTrace,
   *   url: 'http://localhost:11434/api/generate',
   *   model: 'llama2',
   *   autoStore: false
   * });
   * ```
   */
  async extractWithOllama(params: {
    trace: string | object;
    url: string;
    model: string;
    confidenceThreshold?: number;
    contextHint?: string;
    autoStore?: boolean;
    /** Subject Keys for auto-stored memories (when autoStore=true) */
    subject?: {
      subjectId?: string;
      scope?: 'SUBJECT' | 'SEGMENT' | 'GLOBAL';
      segmentId?: string;
      tenantId?: string;
    };
  }): Promise<ExtractMemoriesResponse> {
    return this.extract({
      trace: params.trace,
      llmConfig: {
        type: 'endpoint',
        url: params.url,
        model: params.model,
        format: 'openai', // Ollama supports OpenAI-compatible API
      },
      options: {
        confidenceThreshold: params.confidenceThreshold,
        contextHint: params.contextHint,
        autoStore: params.autoStore,
        subject: params.subject,
      },
    });
  }

  /**
   * Extract memories using custom endpoint
   * For Replicate, Modal, or your own proxy
   *
   * @example
   * ```typescript
   * // Replicate
   * const result = await client.extraction.extractWithCustomEndpoint({
   *   trace: agentTrace,
   *   url: 'https://api.replicate.com/v1/predictions',
   *   authToken: 'r8_...',
   *   format: 'replicate',
   *   model: 'meta/llama-2-70b-chat'
   * });
   *
   * // Your own proxy
   * const result = await client.extraction.extractWithCustomEndpoint({
   *   trace: agentTrace,
   *   url: 'https://your-proxy.com/llm/complete',
   *   authToken: 'Bearer your-token',
   *   format: 'custom'
   * });
   * ```
   */
  async extractWithCustomEndpoint(params: {
    trace: string | object;
    url: string;
    authToken?: string;
    model?: string;
    /** API format - most custom endpoints support OpenAI format */
    format?: 'openai' | 'anthropic' | 'cohere';
    confidenceThreshold?: number;
    contextHint?: string;
    autoStore?: boolean;
    /** Subject Keys for auto-stored memories (when autoStore=true) */
    subject?: {
      subjectId?: string;
      scope?: 'SUBJECT' | 'SEGMENT' | 'GLOBAL';
      segmentId?: string;
      tenantId?: string;
    };
  }): Promise<ExtractMemoriesResponse> {
    return this.extract({
      trace: params.trace,
      llmConfig: {
        type: 'endpoint',
        url: params.url,
        authToken: params.authToken,
        model: params.model,
        format: params.format || 'openai',
      },
      options: {
        confidenceThreshold: params.confidenceThreshold,
        contextHint: params.contextHint,
        autoStore: params.autoStore,
        subject: params.subject,
      },
    });
  }

  /**
   * Extract memories using Xache-managed LLM
   * Xache provides the LLM (requires PII-scrubbed traces)
   *
   * IMPORTANT: Traces must be scrubbed of PII before calling this method.
   * Use the scrubTrace utility from @xache/extractor package.
   *
   * @example
   * ```typescript
   * import { scrubTrace } from '@xache/extractor';
   *
   * // Scrub PII from trace
   * const scrubbed = scrubTrace(rawTrace);
   *
   * if (scrubbed.warnings.length > 0) {
   *   console.warn('PII detected and scrubbed:', scrubbed.warnings);
   * }
   *
   * // Extract using Xache LLM
   * const result = await client.extraction.extractWithXacheLLM({
   *   trace: scrubbed.scrubbedTrace,
   *   provider: 'anthropic',
   *   model: 'claude-3-5-sonnet-20241022'
   * });
   * ```
   */
  async extractWithXacheLLM(params: {
    trace: string | object;
    provider: 'anthropic' | 'openai';
    model?: string;
    confidenceThreshold?: number;
    contextHint?: string;
    autoStore?: boolean;
    /** Subject Keys for auto-stored memories (when autoStore=true) */
    subject?: {
      subjectId?: string;
      scope?: 'SUBJECT' | 'SEGMENT' | 'GLOBAL';
      segmentId?: string;
      tenantId?: string;
    };
  }): Promise<ExtractMemoriesResponse> {
    return this.extract({
      trace: params.trace,
      llmConfig: {
        type: 'xache-managed',
        provider: params.provider,
        model: params.model,
      },
      options: {
        confidenceThreshold: params.confidenceThreshold,
        contextHint: params.contextHint,
        autoStore: params.autoStore,
        subject: params.subject,
      },
    });
  }
}
