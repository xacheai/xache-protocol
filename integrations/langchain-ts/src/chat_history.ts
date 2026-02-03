/**
 * Xache Chat Message History for LangChain.js
 * Persistent message storage with cryptographic receipts
 */

import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { XacheClient, DID } from '@xache/sdk';
import { randomUUID } from 'crypto';

export interface XacheChatMessageHistoryConfig {
  /** Wallet address for authentication */
  walletAddress: string;
  /** Private key for signing */
  privateKey: string;
  /** Session ID to group messages */
  sessionId?: string;
  /** API URL (defaults to https://api.xache.xyz) */
  apiUrl?: string;
  /** Chain: 'base' or 'solana' */
  chain?: 'base' | 'solana';
  /** Maximum messages to load (default: 1000, set to -1 for unlimited) */
  maxMessages?: number;
  /** Page size for loading messages (default: 100) */
  pageSize?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Chat message history backed by Xache Protocol.
 *
 * Messages are stored with cryptographic receipts and can persist
 * across sessions.
 *
 * @example
 * ```typescript
 * import { XacheChatMessageHistory } from '@xache/langchain';
 *
 * const history = new XacheChatMessageHistory({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 *   sessionId: 'unique-session-id',
 * });
 *
 * await history.addUserMessage('Hello!');
 * await history.addAIMessage('Hi there!');
 *
 * const messages = await history.getMessages();
 * ```
 */
export class XacheChatMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ['xache', 'chat_history'];

  private client: XacheClient;
  private sessionId: string;
  private messages: BaseMessage[] = [];
  private initialized = false;
  private maxMessages: number;
  private pageSize: number;

  constructor(config: XacheChatMessageHistoryConfig) {
    super();

    const chainPrefix = config.chain === 'solana' ? 'sol' : 'evm';
    const did = `did:agent:${chainPrefix}:${config.walletAddress.toLowerCase()}` as DID;

    this.client = new XacheClient({
      apiUrl: config.apiUrl || 'https://api.xache.xyz',
      did,
      privateKey: config.privateKey,
      timeout: config.timeout,
      debug: config.debug,
    });

    // Use UUID for collision-resistant session IDs
    this.sessionId = config.sessionId || `langchain-${randomUUID()}`;
    this.maxMessages = config.maxMessages ?? 1000;
    this.pageSize = config.pageSize ?? 100;
  }

  /**
   * Get all messages in the history
   */
  async getMessages(): Promise<BaseMessage[]> {
    if (!this.initialized) {
      await this.loadMessages();
    }
    return this.messages;
  }

  /**
   * Add a message to the history
   */
  async addMessage(message: BaseMessage): Promise<void> {
    this.messages.push(message);

    const role = this.getMessageRole(message);
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

    await this.client.memory.store({
      data: {
        role,
        content,
        sessionId: this.sessionId,
        timestamp: Date.now(),
      },
      storageTier: 'hot',
      context: `chat:${this.sessionId}`,
      tags: ['chat', 'message', role],
      metadata: {
        sessionId: this.sessionId,
        role,
      },
    });
  }

  /**
   * Add a user message
   */
  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage(message));
  }

  /**
   * Add an AI message
   */
  async addAIMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage(message));
  }

  /**
   * Clear all messages from history
   */
  async clear(): Promise<void> {
    this.messages = [];
    // Note: Xache doesn't support deletion - messages remain for audit trail
    // We only clear the local cache
  }

  /**
   * Load messages from Xache storage with pagination support
   */
  private async loadMessages(): Promise<void> {
    try {
      const allMemories: Array<{ storage_key: string; created_at?: string }> = [];
      let offset = 0;
      const effectiveMax = this.maxMessages === -1 ? Infinity : this.maxMessages;

      // Paginate through all messages
      while (allMemories.length < effectiveMax) {
        const result = await this.client.memory.list({
          context: `chat:${this.sessionId}`,
          limit: Math.min(this.pageSize, effectiveMax - allMemories.length),
          offset,
        });

        const memories = Array.isArray(result?.memories) ? result.memories : [];
        if (memories.length === 0) break;

        allMemories.push(...memories);
        offset += memories.length;

        // If we got less than pageSize, we've reached the end
        if (memories.length < this.pageSize) break;
      }

      // Sort by timestamp
      const sortedMemories = [...allMemories].sort((a, b) => {
        const tsA = new Date(a.created_at || 0).getTime();
        const tsB = new Date(b.created_at || 0).getTime();
        return tsA - tsB;
      });

      // For each memory, we need to retrieve the full content
      this.messages = [];
      for (const m of sortedMemories) {
        try {
          const full = await this.client.memory.retrieve({
            storageKey: m.storage_key,
          });
          const data = full.data as { role?: string; content?: string };
          if (data && data.content) {
            switch (data.role) {
              case 'human':
              case 'user':
                this.messages.push(new HumanMessage(data.content));
                break;
              case 'ai':
              case 'assistant':
                this.messages.push(new AIMessage(data.content));
                break;
              case 'system':
                this.messages.push(new SystemMessage(data.content));
                break;
              default:
                this.messages.push(new HumanMessage(data.content));
            }
          }
        } catch (error) {
          // Skip malformed messages but log in debug
          console.debug?.(`[XacheChatMessageHistory] Failed to parse message: ${(error as Error).message}`);
        }
      }

      this.initialized = true;
    } catch (error) {
      // If retrieval fails (e.g., no memories yet), start fresh
      // This is expected for new sessions
      console.debug?.(`[XacheChatMessageHistory] No existing messages found: ${(error as Error).message}`);
      this.messages = [];
      this.initialized = true;
    }
  }

  private getMessageRole(message: BaseMessage): string {
    if (message instanceof HumanMessage) return 'human';
    if (message instanceof AIMessage) return 'ai';
    if (message instanceof SystemMessage) return 'system';
    return 'unknown';
  }
}
