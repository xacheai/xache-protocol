/**
 * Xache Retriever for LangChain.js
 * Memory retrieval for RAG pipelines with verifiable receipts
 */

import { BaseRetriever, BaseRetrieverInput } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { XacheClient, DID, type XacheSigner, type XacheWalletProvider } from '@xache/sdk';

export interface XacheRetrieverConfig extends BaseRetrieverInput {
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
  /** Number of documents to retrieve */
  k?: number;
  /** Filter by context */
  context?: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
}

/**
 * Retriever that fetches documents from Xache memory storage.
 *
 * Use this for RAG pipelines with persistent, verifiable document storage.
 *
 * @example
 * ```typescript
 * import { XacheRetriever } from '@xache/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { RetrievalQAChain } from 'langchain/chains';
 *
 * const retriever = new XacheRetriever({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 *   k: 5,
 * });
 *
 * const qa = RetrievalQAChain.fromLLM(new ChatOpenAI(), retriever);
 * const result = await qa.call({ query: 'What do you know about X?' });
 * ```
 */
export class XacheRetriever extends BaseRetriever {
  lc_namespace = ['xache', 'retriever'];

  static lc_name() {
    return 'XacheRetriever';
  }

  private client: XacheClient;
  private k: number;
  private filterContext?: string;

  constructor(config: XacheRetrieverConfig) {
    super(config);

    const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
    const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

    this.client = new XacheClient({
      apiUrl: config.apiUrl || 'https://api.xache.xyz',
      did,
      privateKey: config.privateKey,
      signer: config.signer,
      walletProvider: config.walletProvider,
      encryptionKey: config.encryptionKey,
    });

    this.k = config.k ?? 5;
    this.filterContext = config.context;
  }

  async _getRelevantDocuments(
    _query: string,
    _runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    // Use list method to get memories filtered by context
    const result = await this.client.memory.list({
      context: this.filterContext,
      limit: this.k,
    });

    const memories = result.memories || [];

    return memories.map(
      (m) =>
        new Document({
          pageContent: m.context || '',
          metadata: {
            storageKey: m.storage_key,
            context: m.context,
            tier: m.storage_tier,
            createdAt: m.created_at,
            size: m.size_bytes,
          },
        })
    );
  }
}
