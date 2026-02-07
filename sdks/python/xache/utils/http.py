"""
HTTP client utilities with retry logic
"""

import asyncio
import json
from typing import Dict, Optional, Any, Literal
from dataclasses import dataclass

import aiohttp

from ..errors import (
    create_error_from_response,
    PaymentRequiredError,
    NetworkError,
    XacheError,
)
from ..types import APIResponse


@dataclass
class RetryConfig:
    """Retry configuration"""
    max_retries: int = 3
    initial_delay: float = 1.0
    max_delay: float = 10.0
    backoff_multiplier: float = 2.0
    retryable_status_codes: Optional[list[int]] = None

    def __post_init__(self) -> None:
        if self.retryable_status_codes is None:
            self.retryable_status_codes = [408, 429, 500, 502, 503, 504]


class HttpClient:
    """HTTP client with retry logic"""

    def __init__(
        self,
        timeout: int = 30,
        retry_config: Optional[RetryConfig] = None,
        debug: bool = False,
    ):
        self.timeout = timeout
        self.retry_config = retry_config or RetryConfig()
        self.debug = debug
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self) -> "HttpClient":
        """Async context manager entry"""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit"""
        await self.close()

    async def _ensure_session(self) -> None:
        """Ensure aiohttp session exists"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def close(self) -> None:
        """Close HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()

    async def request(
        self,
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"],
        url: str,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
    ) -> APIResponse:
        """
        Make HTTP request with retry logic

        Args:
            method: HTTP method
            url: Full URL
            headers: Request headers
            body: Request body (JSON string)

        Returns:
            API response

        Raises:
            XacheError: API error
            NetworkError: Network error
        """
        await self._ensure_session()

        headers = headers or {}
        headers["Content-Type"] = "application/json"

        last_error: Optional[Exception] = None
        attempt = 0

        while attempt <= self.retry_config.max_retries:
            try:
                if self.debug and attempt > 0:
                    print(f"Retry attempt {attempt}/{self.retry_config.max_retries} for {method} {url}")

                response = await self._make_request(method, url, headers, body)
                return response

            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                attempt += 1

                if attempt <= self.retry_config.max_retries:
                    delay = self._calculate_delay(attempt)
                    await asyncio.sleep(delay)
                    continue

            except PaymentRequiredError:
                # Don't retry 402 errors
                raise

            except XacheError:
                # Don't retry API errors (400, 401, 403, 404, 409, etc.)
                raise

            except Exception as e:
                last_error = e
                attempt += 1

                if attempt <= self.retry_config.max_retries:
                    delay = self._calculate_delay(attempt)
                    await asyncio.sleep(delay)
                    continue

        # All retries exhausted
        raise NetworkError(
            f"Request failed after {self.retry_config.max_retries} retries",
            last_error,
        )

    async def _make_request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Optional[str],
    ) -> APIResponse:
        """Make single HTTP request"""
        assert self._session is not None, "Session not initialized. Use async with or call _ensure_session()"
        async with self._session.request(
            method,
            url,
            headers=headers,
            data=body,
        ) as response:
            # Parse response
            try:
                response_json = await response.json()
            except json.JSONDecodeError as e:
                raise NetworkError("Failed to parse response JSON", e)

            # Handle 402 Payment Required (x402-compliant + legacy)
            if response.status == 402:
                x402_version = response_json.get("x402Version")
                accepts = response_json.get("accepts", [])

                # x402 format (v1 or v2): has x402Version + accepts array
                if x402_version in (1, 2) and isinstance(accepts, list) and len(accepts) > 0:
                    requirements = accepts[0]
                    challenge_id = response.headers.get("X-Challenge-ID", "")
                    request_id = response.headers.get("X-Request-ID")
                    fee_payer = (requirements.get("extra") or {}).get("feePayer", "")
                    encoded_hint = f"{requirements.get('network', '')}:{requirements.get('asset', '')}:{requirements.get('maxAmountRequired', '0')}:{fee_payer}"

                    raise PaymentRequiredError(
                        response_json.get("error", "Payment required"),
                        challenge_id,
                        str(requirements.get("maxAmountRequired", "0")),
                        encoded_hint,
                        requirements.get("payTo", ""),
                        requirements.get("description", "Payment required"),
                        request_id,
                    )

                # Fallback to old custom format
                payment_data = response_json.get("payment", {})
                meta = response_json.get("meta", {})
                raise PaymentRequiredError(
                    response_json.get("error", {}).get("message", "Payment required"),
                    payment_data.get("challengeId", ""),
                    payment_data.get("amount", ""),
                    payment_data.get("chainHint", ""),
                    payment_data.get("payTo", ""),
                    payment_data.get("description", ""),
                    meta.get("requestId"),
                )

            # Handle API error responses
            if not response_json.get("success") and response_json.get("error"):
                error = response_json["error"]
                meta = response_json.get("meta", {})
                raise create_error_from_response(
                    error.get("code", "INTERNAL"),
                    error.get("message", "Unknown error"),
                    response.status,
                    error.get("details"),
                    meta.get("requestId"),
                )

            # Check if retryable status code
            if self.retry_config.retryable_status_codes and response.status in self.retry_config.retryable_status_codes:
                raise NetworkError(f"HTTP {response.status}: {response.reason}")

            # Success response
            return APIResponse(
                success=response_json.get("success", True),
                data=response_json.get("data"),
                error=None,
                meta=None,
            )

    def _calculate_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay with jitter"""
        import random

        delay = min(
            self.retry_config.initial_delay * (self.retry_config.backoff_multiplier ** (attempt - 1)),
            self.retry_config.max_delay,
        )

        # Add jitter (±25%)
        jitter = delay * 0.25 * (random.random() * 2 - 1)
        return delay + jitter
