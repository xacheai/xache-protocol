"""Tests for AutoContribute service."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from xache.services.auto_contribute import AutoContributeService, AutoContributeConfig


def make_extraction(confidence=0.9, domain="general", pattern="test pattern data"):
    return {
        "confidence": confidence,
        "data": {
            "pattern": pattern,
            "domain": domain,
            "tags": ["test"],
        },
    }


def make_mock_client(reputation=50.0):
    client = MagicMock()
    client.reputation.get_reputation = AsyncMock(return_value={"overall": reputation})
    client.collective.contribute = AsyncMock(return_value=None)
    return client


class TestDisabled:
    @pytest.mark.asyncio
    async def test_returns_opportunities_when_disabled(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(enabled=False))
        result = await svc.evaluate([make_extraction(0.9), make_extraction(0.5)])
        assert result["contributed"] == 0
        assert result["opportunities"] == 1  # Only the 0.9 one
        assert "disabled" in result["message"]


class TestEnabled:
    @pytest.mark.asyncio
    async def test_contributes_qualified(self):
        client = make_mock_client(reputation=50)
        svc = AutoContributeService(client, AutoContributeConfig(enabled=True))
        result = await svc.evaluate([make_extraction(0.9)])
        assert result["contributed"] == 1
        client.collective.contribute.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_low_confidence(self):
        client = make_mock_client(reputation=50)
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, confidence_threshold=0.95,
        ))
        result = await svc.evaluate([make_extraction(0.9)])
        assert result["contributed"] == 0

    @pytest.mark.asyncio
    async def test_skips_low_reputation(self):
        client = make_mock_client(reputation=10)
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, min_reputation=30,
        ))
        result = await svc.evaluate([make_extraction(0.9)])
        assert result["contributed"] == 0

    @pytest.mark.asyncio
    async def test_domain_filter_include(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, domains=["coding"],
        ))
        result = await svc.evaluate([make_extraction(0.9, domain="general")])
        assert result["contributed"] == 0

    @pytest.mark.asyncio
    async def test_domain_filter_exclude(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, exclude_domains=["general"],
        ))
        result = await svc.evaluate([make_extraction(0.9, domain="general")])
        assert result["contributed"] == 0


class TestDailyLimit:
    @pytest.mark.asyncio
    async def test_max_per_day(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, max_per_day=2,
        ))
        extractions = [
            make_extraction(0.9, pattern=f"pattern-{i}")
            for i in range(5)
        ]
        result = await svc.evaluate(extractions)
        assert result["contributed"] == 2
        assert result["remaining_today"] == 0

    def test_get_remaining_contributions(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(max_per_day=10))
        assert svc.get_remaining_contributions() == 10


class TestDedup:
    @pytest.mark.asyncio
    async def test_deduplicates_same_extraction(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(enabled=True))
        extraction = make_extraction(0.9)
        result = await svc.evaluate([extraction, extraction])
        assert result["contributed"] == 1


class TestDelay:
    @pytest.mark.asyncio
    async def test_delays_contribution(self):
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, delay_hours=24,
        ))
        result = await svc.evaluate([make_extraction(0.9)])
        assert result["contributed"] == 0
        assert result["delayed"] == 1
        # Nothing ready yet
        delayed_result = await svc.process_delayed()
        assert delayed_result["contributed"] == 0
        assert delayed_result["remaining_delayed"] == 1


class TestCallback:
    @pytest.mark.asyncio
    async def test_on_contribute_callback(self):
        callback = MagicMock()
        client = make_mock_client()
        svc = AutoContributeService(client, AutoContributeConfig(
            enabled=True, on_contribute=callback,
        ))
        extraction = make_extraction(0.9)
        await svc.evaluate([extraction])
        callback.assert_called_once_with(extraction)
