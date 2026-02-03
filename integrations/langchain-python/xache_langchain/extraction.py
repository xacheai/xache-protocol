"""
Xache Extraction for LangChain
Automatic memory extraction from conversations
"""

import os
from typing import List, Optional, Dict, Any
from langchain.schema import Document
from pydantic import BaseModel, Field

from xache import XacheClient
from ._async_utils import run_sync


class ExtractionResult(BaseModel):
    """Result from memory extraction"""
    memories: List[Dict[str, Any]] = Field(default_factory=list)
    receipt_id: Optional[str] = None
    transaction: Optional[str] = None


class XacheExtractor:
    """
    Extract memories from text using Xache's LLM-powered extraction.

    Supports three modes:
    - api-key: Use your own API key (BYOK)
    - endpoint: Use your own LLM endpoint
    - xache-managed: Use Xache's hosted LLM

    Example:
        ```python
        from xache_langchain import XacheExtractor

        extractor = XacheExtractor(
            wallet_address="0x...",
            private_key="0x...",
            mode="xache-managed"  # or "api-key" with your key
        )

        # Extract memories from a conversation
        result = extractor.extract(
            trace="User asked about quantum computing. "
                  "I explained superposition and entanglement."
        )

        print(f"Extracted {len(result.memories)} memories")
        for mem in result.memories:
            print(f"  - {mem['content'][:50]}...")
        ```

    With auto-store (memories saved automatically):
        ```python
        result = extractor.extract(
            trace="...",
            auto_store=True  # Extracted memories are stored
        )
        ```
    """

    # Supported LLM providers for api-key mode
    SUPPORTED_PROVIDERS = [
        "anthropic", "openai", "google", "mistral", "groq",
        "together", "fireworks", "cohere", "xai", "deepseek"
    ]

    # Supported API formats for endpoint mode
    SUPPORTED_FORMATS = ["openai", "anthropic", "cohere"]

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        api_url: Optional[str] = None,
        chain: str = "base",
        mode: str = "xache-managed",
        llm_api_key: Optional[str] = None,
        llm_provider: str = "anthropic",
        llm_endpoint: Optional[str] = None,
        llm_endpoint_format: str = "openai",
        llm_auth_token: Optional[str] = None,
        llm_model: Optional[str] = None,
    ):
        """
        Initialize Xache extractor.

        Args:
            wallet_address: Wallet address for authentication
            private_key: Private key for signing
            api_url: Xache API URL (defaults to XACHE_API_URL env var or https://api.xache.xyz)
            chain: Blockchain (base, solana)
            mode: Extraction mode:
                - 'xache-managed': Xache provides LLM ($0.011)
                - 'api-key': Use major provider with your API key ($0.002)
                - 'endpoint': Use custom endpoint ($0.002)
            llm_api_key: Your LLM API key (required for api-key mode)
            llm_provider: Provider for api-key mode. Supported:
                anthropic, openai, google, mistral, groq, together,
                fireworks, cohere, xai, deepseek
            llm_endpoint: Custom endpoint URL (required for endpoint mode)
            llm_endpoint_format: API format for endpoint mode (openai, anthropic, cohere)
            llm_auth_token: Auth token for endpoint mode
            llm_model: Model to use (optional, uses provider default)
        """
        # Validate mode-specific requirements
        if mode == "api-key" and not llm_api_key:
            raise ValueError("llm_api_key is required when mode is 'api-key'")
        if mode == "api-key" and llm_provider not in self.SUPPORTED_PROVIDERS:
            raise ValueError(f"llm_provider must be one of: {', '.join(self.SUPPORTED_PROVIDERS)}")
        if mode == "endpoint" and not llm_endpoint:
            raise ValueError("llm_endpoint is required when mode is 'endpoint'")
        if mode == "endpoint" and llm_endpoint_format not in self.SUPPORTED_FORMATS:
            raise ValueError(f"llm_endpoint_format must be one of: {', '.join(self.SUPPORTED_FORMATS)}")

        self.wallet_address = wallet_address
        self.private_key = private_key
        self.api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self.chain = chain
        self.mode = mode
        self.llm_api_key = llm_api_key
        self.llm_provider = llm_provider
        self.llm_endpoint = llm_endpoint
        self.llm_endpoint_format = llm_endpoint_format
        self.llm_auth_token = llm_auth_token
        self.llm_model = llm_model

        # Build DID
        chain_prefix = "sol" if chain == "solana" else "evm"
        self.did = f"did:agent:{chain_prefix}:{wallet_address.lower()}"

        self._client = XacheClient(
            api_url=self.api_url,
            did=self.did,
            private_key=private_key,
        )

    def extract(
        self,
        trace: str,
        auto_store: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExtractionResult:
        """
        Extract memories from text.

        Args:
            trace: The text to extract memories from
            auto_store: Automatically store extracted memories
            context: Optional context for extraction

        Returns:
            ExtractionResult with extracted memories
        """

        async def _extract():
            async with self._client as client:
                # Build LLM config based on mode
                if self.mode == "api-key":
                    llm_config = {
                        "type": "api-key",
                        "provider": self.llm_provider,
                        "apiKey": self.llm_api_key,
                    }
                    if self.llm_model:
                        llm_config["model"] = self.llm_model
                elif self.mode == "endpoint":
                    llm_config = {
                        "type": "endpoint",
                        "url": self.llm_endpoint,
                        "format": self.llm_endpoint_format,
                    }
                    if self.llm_auth_token:
                        llm_config["authToken"] = self.llm_auth_token
                    if self.llm_model:
                        llm_config["model"] = self.llm_model
                else:
                    llm_config = {
                        "type": "xache-managed",
                        "provider": "anthropic",
                    }
                    if self.llm_model:
                        llm_config["model"] = self.llm_model

                result = await client.extraction.extract(
                    trace=trace,
                    llm_config=llm_config,
                    options={
                        "autoStore": auto_store,
                        "context": context,
                    }
                )

                return ExtractionResult(
                    memories=result.get("memories", []),
                    receipt_id=result.get("receiptId"),
                    transaction=result.get("transaction"),
                )

        return run_sync(_extract())

    async def aextract(
        self,
        trace: str,
        auto_store: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExtractionResult:
        """Async extract memories from text"""
        async with self._client as client:
            # Build LLM config based on mode
            if self.mode == "api-key":
                llm_config = {
                    "type": "api-key",
                    "provider": self.llm_provider,
                    "apiKey": self.llm_api_key,
                }
                if self.llm_model:
                    llm_config["model"] = self.llm_model
            elif self.mode == "endpoint":
                llm_config = {
                    "type": "endpoint",
                    "url": self.llm_endpoint,
                    "format": self.llm_endpoint_format,
                }
                if self.llm_auth_token:
                    llm_config["authToken"] = self.llm_auth_token
                if self.llm_model:
                    llm_config["model"] = self.llm_model
            else:
                llm_config = {
                    "type": "xache-managed",
                    "provider": "anthropic",
                }
                if self.llm_model:
                    llm_config["model"] = self.llm_model

            result = await client.extraction.extract(
                trace=trace,
                llm_config=llm_config,
                options={
                    "autoStore": auto_store,
                    "context": context,
                }
            )

            return ExtractionResult(
                memories=result.get("memories", []),
                receipt_id=result.get("receiptId"),
                transaction=result.get("transaction"),
            )

    def extract_from_messages(
        self,
        messages: List[Any],
        auto_store: bool = False,
    ) -> ExtractionResult:
        """
        Extract memories from LangChain messages.

        Args:
            messages: List of LangChain BaseMessage objects
            auto_store: Automatically store extracted memories

        Returns:
            ExtractionResult with extracted memories
        """
        # Convert messages to trace format
        trace_lines = []
        for msg in messages:
            role = msg.__class__.__name__.replace("Message", "")
            trace_lines.append(f"{role}: {msg.content}")

        trace = "\n".join(trace_lines)
        return self.extract(trace, auto_store=auto_store)
