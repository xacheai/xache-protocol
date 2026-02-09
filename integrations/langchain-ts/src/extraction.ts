/**
 * Xache Memory Extraction for LangChain.js
 * Auto-extract memories from conversations
 */

import { XacheClient, DID, type XacheSigner, type XacheWalletProvider } from '@xache/sdk';
import type { ExtractMemoriesResponse, LLMProvider, LLMApiFormat } from '@xache/sdk';

export interface ExtractedMemory {
  /** Memory content */
  content: string;
  /** Suggested context/category */
  context: string;
  /** Suggested tags */
  tags: string[];
  /** Confidence score */
  confidence: number;
  /** Memory ID if stored */
  memoryId?: string;
}

export interface ExtractionResult {
  /** Extracted memories */
  memories: ExtractedMemory[];
  /** Number of memories extracted */
  count: number;
  /** Total cost in USD */
  cost: number;
  /** Receipt ID for the operation */
  receiptId?: string;
}

export interface XacheExtractorConfig {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing (optional if signer or walletProvider is provided) */
  privateKey?: string;
  /** External signer (alternative to privateKey) */
  signer?: XacheSigner;
  /** Wallet provider for lazy signer resolution */
  walletProvider?: XacheWalletProvider;
  /** Encryption key for use with external signers */
  encryptionKey?: string;
  /**
   * Extraction mode:
   * - 'xache-managed': Xache provides the LLM ($0.011)
   * - 'api-key': Use major provider with known endpoint ($0.002)
   * - 'endpoint': Use custom/self-hosted endpoint ($0.002)
   */
  mode?: 'xache-managed' | 'api-key' | 'endpoint';
  /** Your LLM API key (required if mode is 'api-key') */
  llmApiKey?: string;
  /**
   * LLM provider for api-key mode
   * Supports: anthropic, openai, google, mistral, groq, together, fireworks, cohere, xai, deepseek
   */
  llmProvider?: LLMProvider;
  /** Custom endpoint URL (required if mode is 'endpoint') */
  endpointUrl?: string;
  /** Auth token for custom endpoint */
  endpointAuthToken?: string;
  /** API format for custom endpoint (default: 'openai') */
  endpointFormat?: LLMApiFormat;
  /** Model name (optional, uses provider/endpoint default) */
  model?: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Extract memories from conversation traces.
 *
 * Can auto-store extracted memories to Xache for later retrieval.
 *
 * @example
 * ```typescript
 * import { XacheExtractor } from '@xache/langchain';
 *
 * const extractor = new XacheExtractor({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 *   mode: 'xache-managed',
 * });
 *
 * const result = await extractor.extract(
 *   'User: What is the capital of France?\nAI: Paris is the capital.',
 *   { autoStore: true }
 * );
 *
 * console.log(`Extracted ${result.count} memories`);
 * ```
 */
export class XacheExtractor {
  private client: XacheClient;
  private mode: 'xache-managed' | 'api-key' | 'endpoint';
  private llmApiKey?: string;
  private llmProvider: LLMProvider;
  private endpointUrl?: string;
  private endpointAuthToken?: string;
  private endpointFormat: LLMApiFormat;
  private model?: string;

  constructor(config: XacheExtractorConfig) {
    const mode = config.mode || 'xache-managed';

    // Validate api-key mode requires llmApiKey
    if (mode === 'api-key' && !config.llmApiKey) {
      throw new Error('llmApiKey is required when mode is "api-key"');
    }

    // Validate endpoint mode requires endpointUrl
    if (mode === 'endpoint' && !config.endpointUrl) {
      throw new Error('endpointUrl is required when mode is "endpoint"');
    }

    const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
    const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

    this.client = new XacheClient({
      apiUrl: config.apiUrl || 'https://api.xache.xyz',
      did,
      privateKey: config.privateKey,
      signer: config.signer,
      walletProvider: config.walletProvider,
      encryptionKey: config.encryptionKey,
      timeout: config.timeout,
      debug: config.debug,
    });

    this.mode = mode;
    this.llmApiKey = config.llmApiKey;
    this.llmProvider = config.llmProvider || 'anthropic';
    this.endpointUrl = config.endpointUrl;
    this.endpointAuthToken = config.endpointAuthToken;
    this.endpointFormat = config.endpointFormat || 'openai';
    this.model = config.model;
  }

  /**
   * Extract memories from a conversation trace
   */
  async extract(
    trace: string,
    options?: {
      /** Automatically store extracted memories */
      autoStore?: boolean;
      /** Custom instructions for extraction */
      instructions?: string;
      /** Minimum confidence threshold (0-1) */
      minConfidence?: number;
    }
  ): Promise<ExtractionResult> {
    // Build llmConfig based on mode
    let llmConfig;
    if (this.mode === 'xache-managed') {
      llmConfig = {
        type: 'xache-managed' as const,
        provider: 'anthropic' as const,
        model: this.model,
      };
    } else if (this.mode === 'endpoint') {
      llmConfig = {
        type: 'endpoint' as const,
        url: this.endpointUrl!,
        authToken: this.endpointAuthToken,
        format: this.endpointFormat,
        model: this.model,
      };
    } else {
      llmConfig = {
        type: 'api-key' as const,
        provider: this.llmProvider,
        apiKey: this.llmApiKey || '',
        model: this.model,
      };
    }

    const result: ExtractMemoriesResponse = await this.client.extraction.extract({
      trace,
      llmConfig,
      options: {
        autoStore: options?.autoStore,
        contextHint: options?.instructions,
      },
    });

    const minConfidence = options?.minConfidence ?? 0;
    const memories: ExtractedMemory[] = (result.extractions || [])
      .filter((m) => (m.confidence || 1) >= minConfidence)
      .map((m, index) => ({
        content: m.reasoning || JSON.stringify(m.data) || '',
        context: m.type || 'extracted',
        tags: Object.keys(m.data || {}),
        confidence: m.confidence || 1,
        memoryId: result.stored?.[index],
      }));

    return {
      memories,
      count: memories.length,
      cost: 0, // Cost is handled by x402
      receiptId: result.metadata?.paymentReceiptId,
    };
  }

  /**
   * Extract from LangChain messages
   */
  async extractFromMessages(
    messages: Array<{ role: string; content: string }>,
    options?: {
      autoStore?: boolean;
      instructions?: string;
      minConfidence?: number;
    }
  ): Promise<ExtractionResult> {
    const trace = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    return this.extract(trace, options);
  }
}
