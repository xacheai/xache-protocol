"""Tests for batch processing utilities."""

import pytest
from xache.utils.batch import (
    batch_process,
    batch_process_with_concurrency,
    BatchItemResult,
    BatchResult,
)


class TestBatchProcess:
    @pytest.mark.asyncio
    async def test_all_succeed(self):
        items = [1, 2, 3]

        async def processor(item, index):
            return item * 2

        result = await batch_process(items, processor)
        assert result.all_succeeded is True
        assert result.success_count == 3
        assert result.failure_count == 0
        assert result.total_count == 3
        assert [r.data for r in result.results] == [2, 4, 6]

    @pytest.mark.asyncio
    async def test_partial_failure(self):
        items = [1, 2, 3]

        async def processor(item, index):
            if item == 2:
                raise ValueError("bad item")
            return item * 2

        result = await batch_process(items, processor)
        assert result.all_succeeded is False
        assert result.success_count == 2
        assert result.failure_count == 1
        assert result.results[0].success is True
        assert result.results[0].data == 2
        assert result.results[1].success is False
        assert "bad item" in result.results[1].error
        assert result.results[2].success is True
        assert result.results[2].data == 6

    @pytest.mark.asyncio
    async def test_all_fail(self):
        items = [1, 2]

        async def processor(item, index):
            raise RuntimeError("fail")

        result = await batch_process(items, processor)
        assert result.all_succeeded is False
        assert result.success_count == 0
        assert result.failure_count == 2

    @pytest.mark.asyncio
    async def test_empty_list(self):
        result = await batch_process([], lambda item, index: item)
        assert result.all_succeeded is True
        assert result.total_count == 0

    @pytest.mark.asyncio
    async def test_index_is_passed(self):
        items = ["a", "b", "c"]
        indices = []

        async def processor(item, index):
            indices.append(index)
            return item

        await batch_process(items, processor)
        assert sorted(indices) == [0, 1, 2]


class TestBatchProcessWithConcurrency:
    @pytest.mark.asyncio
    async def test_all_succeed(self):
        items = [10, 20, 30]

        async def processor(item, index):
            return item + 1

        result = await batch_process_with_concurrency(items, processor, concurrency=2)
        assert result.all_succeeded is True
        assert result.success_count == 3
        assert [r.data for r in result.results] == [11, 21, 31]

    @pytest.mark.asyncio
    async def test_partial_failure(self):
        items = [1, 2, 3]

        async def processor(item, index):
            if item == 2:
                raise ValueError("bad")
            return item

        result = await batch_process_with_concurrency(items, processor, concurrency=1)
        assert result.all_succeeded is False
        assert result.success_count == 2
        assert result.failure_count == 1
        assert result.results[1].success is False

    @pytest.mark.asyncio
    async def test_respects_concurrency_limit(self):
        """Verify concurrency=1 means sequential execution."""
        import asyncio

        active = 0
        max_active = 0
        items = list(range(5))

        async def processor(item, index):
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.01)
            active -= 1
            return item

        await batch_process_with_concurrency(items, processor, concurrency=1)
        assert max_active == 1

    @pytest.mark.asyncio
    async def test_preserves_order(self):
        import asyncio

        items = [3, 1, 2]

        async def processor(item, index):
            await asyncio.sleep(item * 0.01)
            return item

        result = await batch_process_with_concurrency(items, processor, concurrency=5)
        # Results are indexed by position, not completion order
        assert result.results[0].data == 3
        assert result.results[1].data == 1
        assert result.results[2].data == 2


class TestBatchItemResult:
    def test_success_item(self):
        item = BatchItemResult(index=0, success=True, data="result")
        assert item.index == 0
        assert item.success is True
        assert item.data == "result"
        assert item.error is None

    def test_failure_item(self):
        item = BatchItemResult(index=1, success=False, error="oops")
        assert item.success is False
        assert item.data is None
        assert item.error == "oops"
