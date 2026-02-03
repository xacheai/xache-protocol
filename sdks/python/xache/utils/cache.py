"""
LRU Cache implementation for memory operations
Production-ready with TTL support and pickle persistence
"""

import time
import pickle
import os
from typing import Dict, Generic, TypeVar, Optional, Any
from dataclasses import dataclass

T = TypeVar('T')


@dataclass
class CacheEntry(Generic[T]):
    """Cache entry with metadata"""
    value: T
    expires_at: float
    access_count: int
    last_accessed: float


class CacheConfig:
    """Configuration for cache behavior"""

    def __init__(
        self,
        enabled: bool = True,
        max_size: int = 100,
        ttl: int = 300000,  # 5 minutes in milliseconds
        storage: str = 'memory',  # 'memory' or 'pickle'
        pickle_path: Optional[str] = None
    ):
        self.enabled = enabled
        self.max_size = max_size
        self.ttl = ttl
        self.storage = storage
        self.pickle_path = pickle_path or os.path.expanduser('~/.xache_cache.pkl')


class LRUCache(Generic[T]):
    """LRU Cache with TTL support and pickle persistence"""

    def __init__(self, config: CacheConfig):
        self.max_size = config.max_size
        self.ttl = config.ttl / 1000  # Convert to seconds
        self.storage = config.storage
        self.pickle_path = config.pickle_path
        self.cache: Dict[str, CacheEntry[T]] = {}

        if self.storage == 'pickle':
            self._load_from_pickle()

    def get(self, key: str) -> Optional[T]:
        """
        Get value from cache

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        entry = self.cache.get(key)

        if entry is None:
            return None

        # Check expiration
        if time.time() > entry.expires_at:
            del self.cache[key]
            self._persist_to_pickle()
            return None

        # Update LRU metadata
        entry.access_count += 1
        entry.last_accessed = time.time()

        # Move to end (LRU)
        del self.cache[key]
        self.cache[key] = entry

        return entry.value

    def set(self, key: str, value: T) -> None:
        """
        Set value in cache

        Args:
            key: Cache key
            value: Value to cache
        """
        # Evict if at capacity
        if len(self.cache) >= self.max_size and key not in self.cache:
            self._evict_lru()

        entry = CacheEntry(
            value=value,
            expires_at=time.time() + self.ttl,
            access_count=1,
            last_accessed=time.time()
        )

        self.cache[key] = entry
        self._persist_to_pickle()

    def has(self, key: str) -> bool:
        """
        Check if key exists and is not expired

        Args:
            key: Cache key

        Returns:
            True if key exists and is valid
        """
        return self.get(key) is not None

    def delete(self, key: str) -> bool:
        """
        Delete specific key

        Args:
            key: Cache key

        Returns:
            True if key was deleted
        """
        if key in self.cache:
            del self.cache[key]
            self._persist_to_pickle()
            return True
        return False

    def clear(self) -> None:
        """Clear entire cache"""
        self.cache.clear()
        self._persist_to_pickle()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Dictionary with cache stats
        """
        return {
            'size': len(self.cache),
            'max_size': self.max_size
        }

    def cleanup(self) -> None:
        """Clean up expired entries"""
        now = time.time()
        keys_to_delete = [
            key for key, entry in self.cache.items()
            if entry.expires_at <= now
        ]

        for key in keys_to_delete:
            del self.cache[key]

        if keys_to_delete:
            self._persist_to_pickle()

    def _evict_lru(self) -> None:
        """Evict least recently used entry"""
        if not self.cache:
            return

        oldest_key = None
        oldest_time = float('inf')

        for key, entry in self.cache.items():
            if entry.last_accessed < oldest_time:
                oldest_time = entry.last_accessed
                oldest_key = key

        if oldest_key:
            del self.cache[oldest_key]

    def _load_from_pickle(self) -> None:
        """Load cache from pickle file"""
        if self.storage != 'pickle':
            return

        try:
            if os.path.exists(self.pickle_path):
                with open(self.pickle_path, 'rb') as f:
                    data = pickle.load(f)

                # Filter expired entries
                now = time.time()
                self.cache = {
                    key: entry for key, entry in data.items()
                    if entry.expires_at > now
                }
        except Exception as e:
            print(f"Warning: Failed to load cache from pickle: {e}")

    def _persist_to_pickle(self) -> None:
        """Persist cache to pickle file"""
        if self.storage != 'pickle':
            return

        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.pickle_path), exist_ok=True)

            with open(self.pickle_path, 'wb') as f:
                pickle.dump(self.cache, f)
        except Exception as e:
            print(f"Warning: Failed to persist cache to pickle: {e}")
