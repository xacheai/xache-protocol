"""
Async utilities for running coroutines in any context.
Handles Jupyter notebooks, async frameworks, and sync contexts.
"""

import asyncio
from typing import TypeVar, Coroutine, Any

T = TypeVar('T')


def run_sync(coro: Coroutine[Any, Any, T]) -> T:
    """
    Run an async coroutine synchronously in any context.

    Works correctly in:
    - Regular sync Python scripts
    - Jupyter notebooks (where event loop is already running)
    - Async frameworks (FastAPI, etc.)

    Args:
        coro: The coroutine to run

    Returns:
        The result of the coroutine
    """
    try:
        # Check if there's already a running event loop
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop - we can safely use asyncio.run()
        return asyncio.run(coro)

    # There's a running loop - we need to handle this carefully
    # This happens in Jupyter notebooks, async frameworks, etc.
    try:
        # Try using nest_asyncio for Jupyter compatibility
        import nest_asyncio
        nest_asyncio.apply()
        return loop.run_until_complete(coro)
    except ImportError:
        # nest_asyncio not installed - use thread pool as fallback
        import concurrent.futures

        def _run_in_thread():
            # Create a new event loop for this thread
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(coro)
            finally:
                new_loop.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_run_in_thread)
            return future.result()
