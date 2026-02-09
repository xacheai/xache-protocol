"""
Xache-enabled Agents for AutoGen
Agents with built-in Xache memory and collective intelligence capabilities
"""

import os
from typing import Any, Callable, Dict, List, Optional, Union, TYPE_CHECKING
from functools import partial

try:
    from autogen import AssistantAgent, ConversableAgent
except ImportError:
    raise ImportError(
        "AutoGen is required. Install it with: pip install pyautogen"
    )

from .functions import (
    memory_store,
    memory_retrieve,
    collective_contribute,
    collective_query,
    check_reputation,
    xache_functions,
)


class XacheMemoryAgent(ConversableAgent):
    """
    AutoGen agent with built-in Xache memory capabilities.

    This agent automatically has access to Xache memory, collective intelligence,
    and reputation functions.

    Example:
        ```python
        from xache_autogen import XacheMemoryAgent

        agent = XacheMemoryAgent(
            name="researcher",
            wallet_address="0x...",
            private_key="0x...",
            llm_config={"model": "gpt-4"}
        )
        ```
    """

    def __init__(
        self,
        name: str,
        wallet_address: str,
        private_key: Optional[str] = None,
        api_url: Optional[str] = None,
        chain: str = "base",
        system_message: Optional[str] = None,
        llm_config: Optional[Dict] = None,
        timeout: int = 30000,
        debug: bool = False,
        signer: Optional[Any] = None,
        wallet_provider: Optional[Any] = None,
        encryption_key: Optional[str] = None,
        **kwargs
    ):
        # Build xache config with env-based default
        resolved_api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self._xache_config = {
            "wallet_address": wallet_address,
            "private_key": private_key,
            "api_url": resolved_api_url,
            "chain": chain,
            "timeout": timeout,
            "debug": debug,
            "signer": signer,
            "wallet_provider": wallet_provider,
            "encryption_key": encryption_key,
        }

        # Create bound function map
        self._xache_function_map = self._create_function_map()

        # Add Xache functions to llm_config (with deduplication)
        if llm_config is None:
            llm_config = {}

        if "functions" not in llm_config:
            llm_config["functions"] = []

        # Deduplicate: only add xache functions that aren't already present
        existing_names = {f.get("name") for f in llm_config["functions"]}
        for func in xache_functions:
            if func.get("name") not in existing_names:
                llm_config["functions"].append(func)
                existing_names.add(func.get("name"))

        # Default system message
        if system_message is None:
            system_message = (
                "You are a helpful assistant with access to persistent memory "
                "and collective intelligence through Xache Protocol. "
                "You can store important information, retrieve past memories, "
                "contribute insights to help other agents, and query the collective "
                "knowledge pool."
            )

        super().__init__(
            name=name,
            system_message=system_message,
            llm_config=llm_config,
            **kwargs
        )

        # Register function executors
        self._register_xache_functions()

    def _create_function_map(self) -> Dict[str, Callable]:
        """Create bound functions with Xache config"""
        config = self._xache_config
        return {
            "xache_memory_store": partial(
                memory_store,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_memory_retrieve": partial(
                memory_retrieve,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_collective_contribute": partial(
                collective_contribute,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_collective_query": partial(
                collective_query,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_check_reputation": partial(
                check_reputation,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
        }

    def _register_xache_functions(self):
        """Register Xache functions as executable"""
        for name, func in self._xache_function_map.items():
            self.register_function(
                function_map={name: func}
            )

    def execute_function(self, func_call: Dict[str, Any]) -> Any:
        """Execute a function call"""
        name = func_call.get("name")
        args = func_call.get("arguments", {})

        if name in self._xache_function_map:
            return self._xache_function_map[name](**args)

        return super().execute_function(func_call)


class XacheAssistantAgent(AssistantAgent):
    """
    AutoGen AssistantAgent with Xache capabilities.

    Extends AssistantAgent with persistent memory and collective intelligence.

    Example:
        ```python
        from xache_autogen import XacheAssistantAgent

        assistant = XacheAssistantAgent(
            name="assistant",
            wallet_address="0x...",
            private_key="0x...",
            llm_config={"model": "gpt-4"}
        )

        # Use in conversation
        user_proxy.initiate_chat(assistant, message="Research quantum computing")
        ```
    """

    def __init__(
        self,
        name: str,
        wallet_address: str,
        private_key: Optional[str] = None,
        api_url: Optional[str] = None,
        chain: str = "base",
        system_message: Optional[str] = None,
        llm_config: Optional[Dict] = None,
        timeout: int = 30000,
        debug: bool = False,
        signer: Optional[Any] = None,
        wallet_provider: Optional[Any] = None,
        encryption_key: Optional[str] = None,
        **kwargs
    ):
        # Build xache config with env-based default
        resolved_api_url = api_url or os.environ.get("XACHE_API_URL", "https://api.xache.xyz")
        self._xache_config = {
            "wallet_address": wallet_address,
            "private_key": private_key,
            "api_url": resolved_api_url,
            "chain": chain,
            "timeout": timeout,
            "debug": debug,
            "signer": signer,
            "wallet_provider": wallet_provider,
            "encryption_key": encryption_key,
        }

        # Create bound function map
        self._xache_function_map = self._create_function_map()

        # Add Xache functions to llm_config (with deduplication)
        if llm_config is None:
            llm_config = {}

        if "functions" not in llm_config:
            llm_config["functions"] = []

        # Deduplicate: only add xache functions that aren't already present
        existing_names = {f.get("name") for f in llm_config["functions"]}
        for func in xache_functions:
            if func.get("name") not in existing_names:
                llm_config["functions"].append(func)
                existing_names.add(func.get("name"))

        # Default system message
        if system_message is None:
            system_message = (
                "You are a helpful AI assistant with persistent memory through "
                "Xache Protocol. You can:\n"
                "- Store important information with xache_memory_store\n"
                "- Retrieve past memories with xache_memory_retrieve\n"
                "- Contribute insights with xache_collective_contribute\n"
                "- Learn from others with xache_collective_query\n"
                "- Check reputation with xache_check_reputation\n\n"
                "Use these capabilities to maintain context across conversations "
                "and contribute to collective knowledge."
            )

        super().__init__(
            name=name,
            system_message=system_message,
            llm_config=llm_config,
            **kwargs
        )

        # Register function executors
        self._register_xache_functions()

    def _create_function_map(self) -> Dict[str, Callable]:
        """Create bound functions with Xache config"""
        config = self._xache_config
        return {
            "xache_memory_store": partial(
                memory_store,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_memory_retrieve": partial(
                memory_retrieve,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_collective_contribute": partial(
                collective_contribute,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_collective_query": partial(
                collective_query,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
            "xache_check_reputation": partial(
                check_reputation,
                wallet_address=config["wallet_address"],
                private_key=config["private_key"],
                api_url=config["api_url"],
                chain=config["chain"],
                signer=config["signer"],
                wallet_provider=config["wallet_provider"],
                encryption_key=config["encryption_key"],
            ),
        }

    def _register_xache_functions(self):
        """Register Xache functions as executable"""
        for name, func in self._xache_function_map.items():
            self.register_function(
                function_map={name: func}
            )
