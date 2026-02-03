/**
 * Xache Memory for LangChain.js
 * Drop-in replacement for ConversationBufferMemory with verifiable receipts
 */

import { BaseMemory, InputValues, OutputValues, MemoryVariables } from '@langchain/core/memory';
import { XacheChatMessageHistory, XacheChatMessageHistoryConfig } from './chat_history';

export interface XacheMemoryConfig extends XacheChatMessageHistoryConfig {
  /** Memory key for input (default: 'input') */
  inputKey?: string;
  /** Memory key for output (default: 'output') */
  outputKey?: string;
  /** Key for returning memory (default: 'history') */
  memoryKey?: string;
  /** Return messages as list vs string */
  returnMessages?: boolean;
}

/**
 * Drop-in replacement for LangChain memory with Xache storage.
 *
 * Provides persistent, verifiable memory that survives across sessions.
 *
 * @example
 * ```typescript
 * import { XacheMemory } from '@xache/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { ConversationChain } from 'langchain/chains';
 *
 * const memory = new XacheMemory({
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 *
 * const chain = new ConversationChain({
 *   llm: new ChatOpenAI(),
 *   memory,
 * });
 *
 * await chain.call({ input: 'Hello!' });
 * ```
 */
export class XacheMemory extends BaseMemory {
  lc_namespace = ['xache', 'memory'];

  private chatHistory: XacheChatMessageHistory;
  private inputKey: string;
  private outputKey: string;
  private memoryKey: string;
  private returnMessages: boolean;

  constructor(config: XacheMemoryConfig) {
    super();
    this.chatHistory = new XacheChatMessageHistory(config);
    this.inputKey = config.inputKey || 'input';
    this.outputKey = config.outputKey || 'output';
    this.memoryKey = config.memoryKey || 'history';
    this.returnMessages = config.returnMessages ?? false;
  }

  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  /**
   * Load memory variables
   */
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    const messages = await this.chatHistory.getMessages();

    if (this.returnMessages) {
      return { [this.memoryKey]: messages };
    }

    // Convert to string format
    const history = messages
      .map((m) => {
        const role = m._getType() === 'human' ? 'Human' : 'AI';
        const content =
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${role}: ${content}`;
      })
      .join('\n');

    return { [this.memoryKey]: history };
  }

  /**
   * Save context from this conversation to buffer
   */
  async saveContext(
    inputValues: InputValues,
    outputValues: OutputValues
  ): Promise<void> {
    const input = inputValues[this.inputKey];
    const output = outputValues[this.outputKey];

    if (input) {
      await this.chatHistory.addUserMessage(String(input));
    }

    if (output) {
      await this.chatHistory.addAIMessage(String(output));
    }
  }

  /**
   * Clear memory contents
   */
  async clear(): Promise<void> {
    await this.chatHistory.clear();
  }
}

/**
 * Extended memory with conversation buffer capabilities
 */
export class XacheConversationBufferMemory extends XacheMemory {
  lc_namespace = ['xache', 'memory', 'buffer'];
}
