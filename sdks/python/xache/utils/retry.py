"""
Retry utility with exponential backoff
Production-ready automatic error recovery
"""

import time
from typing import Callable, TypeVar, List, Optional, Any
from ..types import ErrorCode

T = TypeVar('T')

class RetryPolicy:
    """Configuration for retry behavior"""

    def __init__(
        self,
        max_retries: int = 3,
        backoff_ms: Optional[List[int]] = None,
        retryable_errors: Optional[List[ErrorCode]] = None,
        timeout: int = 60000
    ):
        self.max_retries = max_retries
        self.backoff_ms = backoff_ms or [1000, 2000, 4000]
        self.retryable_errors = retryable_errors or ['RETRY_LATER', 'INTERNAL']
        self.timeout = timeout


def is_retryable_error(error: Exception, retryable_errors: List[ErrorCode]) -> bool:
    """Check if error is retryable"""
    if hasattr(error, 'code'):
        return error.code in retryable_errors
    return False


def with_retry(
    fn: Callable[[], T],
    policy: Optional[RetryPolicy] = None,
    debug: bool = False
) -> T:
    """
    Execute function with automatic retry logic

    Args:
        fn: Function to execute
        policy: Retry policy configuration
        debug: Enable debug logging

    Returns:
        Result from successful function execution

    Raises:
        Last exception if all retries exhausted

    Example:
        >>> def fetch_data():
        ...     return api.get('/data')
        >>> result = with_retry(fetch_data, RetryPolicy(max_retries=5))
    """
    if policy is None:
        policy = RetryPolicy()

    start_time = time.time() * 1000  # Convert to milliseconds
    last_error: Optional[Exception] = None

    for attempt in range(policy.max_retries + 1):
        # Check timeout
        if (time.time() * 1000 - start_time) > policy.timeout:
            raise TimeoutError(
                f"Operation timed out after {policy.timeout}ms ({attempt} attempts)"
            )

        try:
            return fn()
        except Exception as error:
            last_error = error

            # If this is the last attempt, don't retry
            if attempt == policy.max_retries:
                break

            # Check if error is retryable
            if not is_retryable_error(error, policy.retryable_errors):
                raise error

            # Calculate delay
            if attempt < len(policy.backoff_ms):
                delay = policy.backoff_ms[attempt]
            else:
                delay = policy.backoff_ms[-1]

            if debug:
                print(f"Retry attempt {attempt + 1}/{policy.max_retries} after {delay}ms delay")

            # Sleep for delay (convert ms to seconds)
            time.sleep(delay / 1000)

    # All retries exhausted, raise last error
    if last_error:
        raise last_error
    else:
        raise RuntimeError("Unexpected error in retry logic")
