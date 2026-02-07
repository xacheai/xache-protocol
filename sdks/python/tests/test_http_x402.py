"""
HTTP client tests — x402 payment protocol handling

Tests the 402 response parsing in HttpClient._make_request.
Uses aiohttp test utilities to mock HTTP responses.
"""

import json
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from xache.utils.http import HttpClient, RetryConfig
from xache.errors import PaymentRequiredError, NetworkError, XacheError


# ============================================================
# Helpers
# ============================================================

def make_mock_response(status, body, headers=None):
    """Create a mock aiohttp response."""
    resp = AsyncMock()
    resp.status = status
    resp.reason = "OK" if status == 200 else "Error"
    resp.headers = headers or {}
    resp.json = AsyncMock(return_value=body)
    # Support async context manager
    resp.__aenter__ = AsyncMock(return_value=resp)
    resp.__aexit__ = AsyncMock(return_value=False)
    return resp


# ============================================================
# Tests — x402 format
# ============================================================

class TestX402Format:
    """Test x402 v1/v2 402 response parsing."""

    @pytest.mark.asyncio
    async def test_x402_v1_raises_payment_required(self):
        body = {
            "x402Version": 1,
            "accepts": [{
                "network": "base",
                "asset": "USDC",
                "maxAmountRequired": "2100",
                "payTo": "0xRecipient",
                "description": "Memory store fee",
                "extra": {"feePayer": "0xFeePayer"},
            }],
            "error": "Payment required",
        }
        headers = {
            "X-Challenge-ID": "chal_abc123",
            "X-Request-ID": "req_xyz789",
        }
        mock_resp = make_mock_response(402, body, headers)

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(PaymentRequiredError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/memory/store", {}, None)

        err = exc_info.value
        assert err.challenge_id == "chal_abc123"
        assert err.amount == "2100"
        assert "base" in err.chain_hint
        assert "USDC" in err.chain_hint
        assert "0xFeePayer" in err.chain_hint
        assert err.pay_to == "0xRecipient"
        assert err.description == "Memory store fee"

    @pytest.mark.asyncio
    async def test_x402_v2_raises_payment_required(self):
        body = {
            "x402Version": 2,
            "accepts": [{
                "network": "solana",
                "asset": "USDC",
                "maxAmountRequired": "3100",
                "payTo": "SolRecipient",
                "description": "Retrieve fee",
                "extra": {"feePayer": "SolFeePayer"},
            }],
            "error": "Payment required",
        }
        headers = {
            "X-Challenge-ID": "chal_sol456",
            "X-Request-ID": "req_sol999",
        }
        mock_resp = make_mock_response(402, body, headers)

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(PaymentRequiredError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/memory/retrieve", {}, None)

        err = exc_info.value
        assert err.challenge_id == "chal_sol456"
        assert err.amount == "3100"
        assert "solana" in err.chain_hint
        assert err.pay_to == "SolRecipient"

    @pytest.mark.asyncio
    async def test_x402_no_fee_payer_defaults_empty(self):
        body = {
            "x402Version": 1,
            "accepts": [{
                "network": "base",
                "asset": "USDC",
                "maxAmountRequired": "1000",
                "payTo": "0xRecipient",
                "description": "Fee",
            }],
            "error": "Payment required",
        }
        mock_resp = make_mock_response(402, body, {"X-Challenge-ID": "chal_nofee"})

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(PaymentRequiredError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/test", {}, None)

        err = exc_info.value
        # chain_hint should end with empty string (no fee payer)
        assert err.chain_hint == "base:USDC:1000:"


class TestLegacy402Format:
    """Test legacy (pre-x402) 402 response parsing."""

    @pytest.mark.asyncio
    async def test_legacy_402_format(self):
        body = {
            "error": {"message": "Legacy payment required"},
            "payment": {
                "challengeId": "legacy_chal",
                "amount": "5000",
                "chainHint": "base:USDC",
                "payTo": "0xLegacyRecipient",
                "description": "Legacy fee",
            },
            "meta": {"requestId": "legacy_req"},
        }
        mock_resp = make_mock_response(402, body, {})

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(PaymentRequiredError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/memory/store", {}, None)

        err = exc_info.value
        assert err.challenge_id == "legacy_chal"
        assert err.amount == "5000"
        assert err.chain_hint == "base:USDC"
        assert err.pay_to == "0xLegacyRecipient"

    @pytest.mark.asyncio
    async def test_402_without_x402version_uses_legacy(self):
        """A 402 without x402Version field should use legacy parsing."""
        body = {
            "error": {"message": "Pay up"},
            "payment": {
                "challengeId": "chal_old",
                "amount": "100",
                "chainHint": "solana:SOL",
                "payTo": "SolAddr",
                "description": "Old fee",
            },
            "meta": {},
        }
        mock_resp = make_mock_response(402, body, {})

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(PaymentRequiredError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/test", {}, None)

        err = exc_info.value
        assert err.challenge_id == "chal_old"
        assert err.chain_hint == "solana:SOL"


class TestAPIErrorResponses:
    """Test non-402 error response handling."""

    @pytest.mark.asyncio
    async def test_api_error_raises_xache_error(self):
        body = {
            "success": False,
            "error": {
                "code": "INVALID_INPUT",
                "message": "memory_id is required",
            },
            "meta": {"requestId": "req_err"},
        }
        mock_resp = make_mock_response(400, body, {})

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        with pytest.raises(XacheError) as exc_info:
            await client._make_request("POST", "https://api.xache.xyz/v1/memory/retrieve", {}, None)

        err = exc_info.value
        assert err.code == "INVALID_INPUT"
        assert "memory_id" in err.message

    @pytest.mark.asyncio
    async def test_success_response(self):
        body = {
            "success": True,
            "data": {"memoryId": "mem_abc", "storageTier": "hot"},
        }
        mock_resp = make_mock_response(200, body, {})

        client = HttpClient()
        client._session = MagicMock()
        client._session.request = MagicMock(return_value=mock_resp)

        response = await client._make_request("POST", "https://api.xache.xyz/v1/memory/store", {}, None)
        assert response.success is True
        assert response.data["memoryId"] == "mem_abc"


class TestRetryConfig:
    """Test RetryConfig defaults and behavior."""

    def test_default_retryable_codes(self):
        config = RetryConfig()
        assert 408 in config.retryable_status_codes
        assert 429 in config.retryable_status_codes
        assert 500 in config.retryable_status_codes
        assert 502 in config.retryable_status_codes
        assert 503 in config.retryable_status_codes
        assert 504 in config.retryable_status_codes

    def test_custom_retryable_codes(self):
        config = RetryConfig(retryable_status_codes=[500, 503])
        assert config.retryable_status_codes == [500, 503]

    def test_backoff_delay(self):
        client = HttpClient(retry_config=RetryConfig(initial_delay=1.0, backoff_multiplier=2.0, max_delay=10.0))
        # Attempt 1: delay = min(1.0 * 2^0, 10) = 1.0 ± 25% jitter
        delay = client._calculate_delay(1)
        assert 0.75 <= delay <= 1.25

        # Attempt 3: delay = min(1.0 * 2^2, 10) = 4.0 ± 25% jitter
        delay = client._calculate_delay(3)
        assert 3.0 <= delay <= 5.0

    def test_max_delay_cap(self):
        client = HttpClient(retry_config=RetryConfig(initial_delay=1.0, backoff_multiplier=2.0, max_delay=5.0))
        # Attempt 10: delay = min(1.0 * 2^9, 5) = min(512, 5) = 5.0 ± 25% jitter
        delay = client._calculate_delay(10)
        assert 3.75 <= delay <= 6.25
