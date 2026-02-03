"""
Custom exception classes for Xache SDK
Maps to API error codes per LLD §2.1
"""

from typing import Optional, Dict, Any


class XacheError(Exception):
    """Base Xache error class"""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.request_id = request_id

    def __str__(self) -> str:
        msg = f"[{self.code}] {self.message}"
        if self.request_id:
            msg += f" (request_id: {self.request_id})"
        return msg


class UnauthenticatedError(XacheError):
    """Authentication error (401)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("UNAUTHENTICATED", message, 401, details, request_id)


class PaymentRequiredError(XacheError):
    """Payment required error (402)"""

    def __init__(
        self,
        message: str,
        challenge_id: str,
        amount: str,
        chain_hint: str,
        pay_to: str,
        description: str,
        request_id: Optional[str] = None,
    ):
        details = {
            "challenge_id": challenge_id,
            "amount": amount,
            "chain_hint": chain_hint,
            "pay_to": pay_to,
            "description": description,
        }
        super().__init__("PAYMENT_REQUIRED", message, 402, details, request_id)
        self.challenge_id = challenge_id
        self.amount = amount
        self.chain_hint = chain_hint
        self.pay_to = pay_to
        self.description = description


class RateLimitedError(XacheError):
    """Rate limited error (429)"""

    def __init__(
        self,
        message: str,
        reset_at: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        error_details = details or {}
        if reset_at:
            error_details["reset_at"] = reset_at
        super().__init__("RATE_LIMITED", message, 429, error_details, request_id)
        self.reset_at = reset_at


class BudgetExceededError(XacheError):
    """Budget exceeded error (400)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("BUDGET_EXCEEDED", message, 400, details, request_id)


class InvalidInputError(XacheError):
    """Invalid input error (400)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("INVALID_INPUT", message, 400, details, request_id)


class ConflictError(XacheError):
    """Conflict error (409)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("CONFLICT", message, 409, details, request_id)


class RetryLaterError(XacheError):
    """Retry later error (503)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("RETRY_LATER", message, 503, details, request_id)


class InternalError(XacheError):
    """Internal server error (500)"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__("INTERNAL", message, 500, details, request_id)


class NetworkError(Exception):
    """Network error (not from API)"""

    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.original_error = original_error


def create_error_from_response(
    code: str,
    message: str,
    status_code: int,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
) -> XacheError:
    """Create appropriate error from API response"""
    error_map = {
        "UNAUTHENTICATED": UnauthenticatedError,
        "RATE_LIMITED": RateLimitedError,
        "BUDGET_EXCEEDED": BudgetExceededError,
        "INVALID_INPUT": InvalidInputError,
        "CONFLICT": ConflictError,
        "RETRY_LATER": RetryLaterError,
        "INTERNAL": InternalError,
    }

    error_class = error_map.get(code)
    if error_class:
        if code == "RATE_LIMITED":
            reset_at = details.get("reset_at") if details else None
            return error_class(message, reset_at, details, request_id)
        return error_class(message, details, request_id)

    return XacheError(code, message, status_code, details, request_id)
