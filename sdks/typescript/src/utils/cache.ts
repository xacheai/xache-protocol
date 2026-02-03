/**
 * LRU Cache implementation for memory operations
 * Production-ready with TTL support and storage backends
 */

import type { CacheConfig, CacheStorage } from '../types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * LRU Cache with TTL support
 */
export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttl: number;
  private storage: CacheStorage;
  private storageKey = 'xache_cache';

  constructor(config: Required<CacheConfig>) {
    this.maxSize = config.maxSize;
    this.ttl = config.ttl;
    this.storage = config.storage;
    this.cache = new Map();

    if (this.storage === 'localStorage' && this.isLocalStorageAvailable()) {
      this.loadFromLocalStorage();
    }
  }

  /**
   * Check if localStorage is available (browser environment)
   */
  private isLocalStorageAvailable(): boolean {
    try {
      const testKey = '__xache_test__';
      const storage = (globalThis as any).localStorage;
      if (!storage) return false;
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.persistToLocalStorage();
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + this.ttl,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.persistToLocalStorage();
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.persistToLocalStorage();
    return result;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.persistToLocalStorage();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromLocalStorage(): void {
    if (this.storage !== 'localStorage' || !this.isLocalStorageAvailable()) {
      return;
    }

    try {
      const storage = (globalThis as any).localStorage;
      const stored = storage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored) as Array<[string, CacheEntry<T>]>;
      const now = Date.now();

      for (const [key, entry] of data) {
        if (entry.expiresAt > now) {
          this.cache.set(key, entry);
        }
      }
    } catch (error) {
      console.warn('Failed to load cache from localStorage:', error);
    }
  }

  /**
   * Persist cache to localStorage
   */
  private persistToLocalStorage(): void {
    if (this.storage !== 'localStorage' || !this.isLocalStorageAvailable()) {
      return;
    }

    try {
      const storage = (globalThis as any).localStorage;
      const data = Array.from(this.cache.entries());
      storage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist cache to localStorage:', error);
    }
  }

  /**
   * Clean up expired entries (run periodically)
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.persistToLocalStorage();
    }
  }
}
