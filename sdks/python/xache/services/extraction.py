"""
Extraction Service - AI-powered memory extraction from conversations
Supports 10 major LLM providers plus custom endpoints
"""

from typing import List, Optional, Dict, Any, Union, Literal
from dataclasses import dataclass, field


# LLM Provider type - matches TypeScript SDK
LLMProvider = Literal[
    'anthropic', 'openai', 'google', 'mistral', 'groq',
    'together', 'fireworks', 'cohere', 'xai', 'deepseek'
]

# LLM API format for custom endpoints
LLMApiFormat = Literal['openai', 'anthropic', 'cohere']


@dataclass
class LLMConfigApiKey:
    """LLM config for api-key mode - use your own API key with major providers"""
    type: Literal['api-key'] = 'api-key'
    provider: LLMProvider = 'anthropic'
    api_key: str = ''
    model: Optional[str] = None


@dataclass
class LLMConfigEndpoint:
    """LLM config for endpoint mode - custom/self-hosted endpoints"""
    type: Literal['endpoint'] = 'endpoint'
    url: str = ''
    auth_token: Optional[str] = None
    model: Optional[str] = None
    format: LLMApiFormat = 'openai'


@dataclass
class LLMConfigXacheManaged:
    """LLM config for xache-managed mode - Xache provides the LLM"""
    type: Literal['xache-managed'] = 'xache-managed'
    provider: Literal['anthropic', 'openai'] = 'anthropic'
    model: Optional[str] = None


# Union type for LLM config
LLMConfig = Union[LLMConfigApiKey, LLMConfigEndpoint, LLMConfigXacheManaged]


@dataclass
class ExtractedMemory:
    """Extracted memory from conversation"""
    type: str  # 'preference', 'fact', 'pattern', 'relationship', etc.
    data: Dict[str, Any] = field(default_factory=dict)
    reasoning: Optional[str] = None
    confidence: float = 1.0


@dataclass
class ExtractionMetadata:
    """Metadata about the extraction operation"""
    extraction_time: int = 0
    llm_provider: str = ''
    llm_model: str = ''
    total_extractions: int = 0
    stored_count: int = 0
    payment_receipt_id: Optional[str] = None


@dataclass
class ExtractionResult:
    """Result from memory extraction"""
    extractions: List[ExtractedMemory] = field(default_factory=list)
    stored: Optional[List[str]] = None
    metadata: ExtractionMetadata = field(default_factory=ExtractionMetadata)


@dataclass
class ExtractionOptions:
    """Options for extraction"""
    confidence_threshold: Optional[float] = None
    context_hint: Optional[str] = None
    auto_store: bool = False
    subject: Optional[Dict[str, Any]] = None


class ExtractionService:
    """
    Extraction service for AI-powered memory extraction

    Supports three LLM modes:
    1. api-key: Use your own API key with major providers (10 supported)
       - anthropic, openai, google, mistral, groq
       - together, fireworks, cohere, xai, deepseek
       - Cost: $0.002 per extraction

    2. endpoint: Use custom/self-hosted endpoints
       - Ollama, OpenRouter, vLLM, Modal, Replicate, etc.
       - Supports openai, anthropic, cohere API formats
       - Cost: $0.002 per extraction

    3. xache-managed: Xache provides the LLM
       - Requires PII-scrubbed traces
       - Cost: $0.011 per extraction

    Example:
        ```python
        from xache.services.extraction import LLMConfigApiKey

        # Using your own Anthropic key
        result = await client.extraction.extract(
            trace="User: I prefer dark mode\\nAgent: I'll remember that",
            llm_config=LLMConfigApiKey(
                provider='anthropic',
                api_key='sk-ant-...',
            ),
            options=ExtractionOptions(
                confidence_threshold=0.8,
                auto_store=True,
            )
        )

        print(f"Extracted {len(result.extractions)} memories")
        ```
    """

    # Supported providers for api-key mode
    SUPPORTED_PROVIDERS: List[str] = [
        'anthropic', 'openai', 'google', 'mistral', 'groq',
        'together', 'fireworks', 'cohere', 'xai', 'deepseek'
    ]

    # Supported API formats for endpoint mode
    SUPPORTED_FORMATS: List[str] = ['openai', 'anthropic', 'cohere']

    def __init__(self, client):
        self.client = client

    def _build_llm_config_dict(self, llm_config: LLMConfig) -> Dict[str, Any]:
        """Convert dataclass to API-compatible dict"""
        if isinstance(llm_config, LLMConfigApiKey):
            config = {
                'type': 'api-key',
                'provider': llm_config.provider,
                'apiKey': llm_config.api_key,
            }
            if llm_config.model:
                config['model'] = llm_config.model
            return config

        elif isinstance(llm_config, LLMConfigEndpoint):
            config = {
                'type': 'endpoint',
                'url': llm_config.url,
                'format': llm_config.format,
            }
            if llm_config.auth_token:
                config['authToken'] = llm_config.auth_token
            if llm_config.model:
                config['model'] = llm_config.model
            return config

        elif isinstance(llm_config, LLMConfigXacheManaged):
            config = {
                'type': 'xache-managed',
                'provider': llm_config.provider,
            }
            if llm_config.model:
                config['model'] = llm_config.model
            return config

        else:
            # Assume it's already a dict
            return llm_config

    async def extract(
        self,
        trace: Union[str, Dict[str, Any]],
        llm_config: LLMConfig,
        options: Optional[ExtractionOptions] = None,
    ) -> ExtractionResult:
        """
        Extract memories from agent trace using specified LLM

        Args:
            trace: The conversation trace (string or object)
            llm_config: LLM configuration (api-key, endpoint, or xache-managed)
            options: Extraction options

        Returns:
            ExtractionResult with extracted memories

        Example:
            ```python
            # Using OpenAI
            result = await client.extraction.extract(
                trace="User: I always use vim keybindings...",
                llm_config=LLMConfigApiKey(
                    provider='openai',
                    api_key='sk-...',
                    model='gpt-4-turbo',
                ),
                options=ExtractionOptions(auto_store=True),
            )

            # Using custom endpoint (Ollama)
            result = await client.extraction.extract(
                trace=conversation,
                llm_config=LLMConfigEndpoint(
                    url='http://localhost:11434/v1/chat/completions',
                    model='llama2',
                    format='openai',
                ),
            )

            # Using Xache-managed LLM
            result = await client.extraction.extract(
                trace=scrubbed_trace,  # Must be PII-scrubbed
                llm_config=LLMConfigXacheManaged(
                    provider='anthropic',
                ),
            )
            ```
        """
        body: Dict[str, Any] = {
            'trace': trace,
            'llmConfig': self._build_llm_config_dict(llm_config),
        }

        if options:
            opts: Dict[str, Any] = {}
            if options.confidence_threshold is not None:
                opts['confidenceThreshold'] = options.confidence_threshold
            if options.context_hint:
                opts['contextHint'] = options.context_hint
            if options.auto_store:
                opts['autoStore'] = options.auto_store
            if options.subject:
                opts['subject'] = options.subject
            if opts:
                body['options'] = opts

        response = await self.client.request('POST', '/v1/extract', body)

        if not response.success or not response.data:
            raise Exception(
                response.error.get('message', 'Failed to extract memories')
                if response.error
                else 'Failed to extract memories'
            )

        data = response.data

        # Parse extractions
        extractions = []
        for m in data.get('extractions', []):
            extractions.append(ExtractedMemory(
                type=m.get('type', 'unknown'),
                data=m.get('data', {}),
                reasoning=m.get('reasoning'),
                confidence=m.get('confidence', 1.0),
            ))

        # Parse metadata
        meta = data.get('metadata', {})
        metadata = ExtractionMetadata(
            extraction_time=meta.get('extractionTime', 0),
            llm_provider=meta.get('llmProvider', ''),
            llm_model=meta.get('llmModel', ''),
            total_extractions=meta.get('totalExtractions', 0),
            stored_count=meta.get('storedCount', 0),
            payment_receipt_id=meta.get('paymentReceiptId'),
        )

        return ExtractionResult(
            extractions=extractions,
            stored=data.get('stored'),
            metadata=metadata,
        )

    async def extract_with_anthropic(
        self,
        trace: Union[str, Dict[str, Any]],
        api_key: str,
        model: Optional[str] = None,
        auto_store: bool = False,
        confidence_threshold: Optional[float] = None,
        context_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Convenience method: Extract memories using Anthropic

        Args:
            trace: Conversation trace
            api_key: Your Anthropic API key
            model: Model name (default: claude-sonnet-4-20250514)
            auto_store: Whether to auto-store extracted memories
            confidence_threshold: Minimum confidence threshold
            context_hint: Context hint for extraction

        Example:
            ```python
            result = await client.extraction.extract_with_anthropic(
                trace="User: I prefer dark mode...",
                api_key="sk-ant-...",
                auto_store=True,
            )
            ```
        """
        return await self.extract(
            trace=trace,
            llm_config=LLMConfigApiKey(
                provider='anthropic',
                api_key=api_key,
                model=model,
            ),
            options=ExtractionOptions(
                auto_store=auto_store,
                confidence_threshold=confidence_threshold,
                context_hint=context_hint,
            ),
        )

    async def extract_with_openai(
        self,
        trace: Union[str, Dict[str, Any]],
        api_key: str,
        model: Optional[str] = None,
        auto_store: bool = False,
        confidence_threshold: Optional[float] = None,
        context_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Convenience method: Extract memories using OpenAI

        Args:
            trace: Conversation trace
            api_key: Your OpenAI API key
            model: Model name (default: gpt-4-turbo)
            auto_store: Whether to auto-store extracted memories
            confidence_threshold: Minimum confidence threshold
            context_hint: Context hint for extraction

        Example:
            ```python
            result = await client.extraction.extract_with_openai(
                trace="User: I prefer dark mode...",
                api_key="sk-...",
                model="gpt-4-turbo",
                auto_store=True,
            )
            ```
        """
        return await self.extract(
            trace=trace,
            llm_config=LLMConfigApiKey(
                provider='openai',
                api_key=api_key,
                model=model,
            ),
            options=ExtractionOptions(
                auto_store=auto_store,
                confidence_threshold=confidence_threshold,
                context_hint=context_hint,
            ),
        )

    async def extract_with_endpoint(
        self,
        trace: Union[str, Dict[str, Any]],
        url: str,
        model: str,
        auth_token: Optional[str] = None,
        format: LLMApiFormat = 'openai',
        auto_store: bool = False,
        confidence_threshold: Optional[float] = None,
        context_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Extract memories using custom endpoint (Ollama, OpenRouter, vLLM, etc.)

        Args:
            trace: Conversation trace
            url: Endpoint URL
            model: Model name
            auth_token: Optional auth token
            format: API format (openai, anthropic, cohere)
            auto_store: Whether to auto-store extracted memories
            confidence_threshold: Minimum confidence threshold
            context_hint: Context hint for extraction

        Example:
            ```python
            # Ollama
            result = await client.extraction.extract_with_endpoint(
                trace="User: I prefer dark mode...",
                url="http://localhost:11434/v1/chat/completions",
                model="llama2",
                format="openai",
            )

            # OpenRouter
            result = await client.extraction.extract_with_endpoint(
                trace="User: ...",
                url="https://openrouter.ai/api/v1/chat/completions",
                model="anthropic/claude-3-sonnet",
                auth_token="sk-or-...",
                format="openai",
            )
            ```
        """
        return await self.extract(
            trace=trace,
            llm_config=LLMConfigEndpoint(
                url=url,
                model=model,
                auth_token=auth_token,
                format=format,
            ),
            options=ExtractionOptions(
                auto_store=auto_store,
                confidence_threshold=confidence_threshold,
                context_hint=context_hint,
            ),
        )

    async def extract_with_xache_llm(
        self,
        trace: Union[str, Dict[str, Any]],
        provider: Literal['anthropic', 'openai'] = 'anthropic',
        model: Optional[str] = None,
        auto_store: bool = False,
        confidence_threshold: Optional[float] = None,
        context_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Extract memories using Xache-managed LLM

        IMPORTANT: Traces must be scrubbed of PII before calling this method.

        Args:
            trace: PII-scrubbed conversation trace
            provider: Xache-managed provider (anthropic or openai)
            model: Optional model override
            auto_store: Whether to auto-store extracted memories
            confidence_threshold: Minimum confidence threshold
            context_hint: Context hint for extraction

        Example:
            ```python
            # Scrub PII first
            scrubbed = scrub_trace(raw_trace)

            result = await client.extraction.extract_with_xache_llm(
                trace=scrubbed,
                provider="anthropic",
                auto_store=True,
            )
            ```
        """
        return await self.extract(
            trace=trace,
            llm_config=LLMConfigXacheManaged(
                provider=provider,
                model=model,
            ),
            options=ExtractionOptions(
                auto_store=auto_store,
                confidence_threshold=confidence_threshold,
                context_hint=context_hint,
            ),
        )
