"""
Batch operation utilities

Provides helpers for running batch operations with partial failure handling.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Generic, List, Optional, TypeVar

T_Input = TypeVar("T_Input")
T_Output = TypeVar("T_Output")


@dataclass
class BatchItemResult:
    """Result of a single item in a batch operation."""
    index: int
    success: bool
    data: Any = None
    error: Optional[str] = None


@dataclass
class BatchResult:
    """Aggregated result of a batch operation."""
    results: List[BatchItemResult] = field(default_factory=list)
    success_count: int = 0
    failure_count: int = 0
    total_count: int = 0
    all_succeeded: bool = True


async def batch_process(
    items: List[Any],
    processor: Callable[..., Awaitable[Any]],
) -> BatchResult:
    """
    Process items in batch with partial failure handling.

    Uses asyncio.gather with return_exceptions so that one failure
    doesn't stop other items from processing.

    Args:
        items: Array of items to process
        processor: Async function(item, index) -> result

    Returns:
        Aggregated batch result with individual item results
    """
    tasks = [processor(item, i) for i, item in enumerate(items)]
    settlements = await asyncio.gather(*tasks, return_exceptions=True)

    results: List[BatchItemResult] = []
    for i, settlement in enumerate(settlements):
        if isinstance(settlement, Exception):
            results.append(BatchItemResult(
                index=i,
                success=False,
                error=str(settlement),
            ))
        else:
            results.append(BatchItemResult(
                index=i,
                success=True,
                data=settlement,
            ))

    success_count = sum(1 for r in results if r.success)
    failure_count = len(results) - success_count

    return BatchResult(
        results=results,
        success_count=success_count,
        failure_count=failure_count,
        total_count=len(results),
        all_succeeded=failure_count == 0,
    )


async def batch_process_with_concurrency(
    items: List[Any],
    processor: Callable[..., Awaitable[Any]],
    concurrency: int = 10,
) -> BatchResult:
    """
    Process items in batch with concurrency limit.

    Like batch_process but limits how many items are processed concurrently.
    Useful for rate-limited APIs or resource-constrained environments.

    Args:
        items: Array of items to process
        processor: Async function(item, index) -> result
        concurrency: Maximum concurrent operations (default: 10)

    Returns:
        Aggregated batch result with individual item results
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: List[BatchItemResult] = [None] * len(items)  # type: ignore[list-item]

    async def process_item(index: int, item: Any) -> None:
        async with semaphore:
            try:
                data = await processor(item, index)
                results[index] = BatchItemResult(index=index, success=True, data=data)
            except Exception as e:
                results[index] = BatchItemResult(index=index, success=False, error=str(e))

    await asyncio.gather(*[process_item(i, item) for i, item in enumerate(items)])

    success_count = sum(1 for r in results if r.success)
    failure_count = len(results) - success_count

    return BatchResult(
        results=results,
        success_count=success_count,
        failure_count=failure_count,
        total_count=len(results),
        all_succeeded=failure_count == 0,
    )
