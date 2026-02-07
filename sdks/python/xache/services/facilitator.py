"""
Facilitator Service - x402 v2 facilitator selection and management

Fetches facilitator configuration from the API for network-agnostic operation.
"""

from typing import List, Optional, Dict, Any, Literal
from dataclasses import dataclass, field
import time


# Type aliases
NetworkId = Literal['base', 'base-sepolia', 'solana', 'solana-devnet']
PaymentScheme = Literal['exact']
ChainType = Literal['evm', 'solana']


@dataclass
class FacilitatorConfig:
    """Facilitator configuration"""
    id: str
    name: str
    chains: List[ChainType]
    networks: List[str]
    schemes: List[PaymentScheme]
    priority: int
    healthy: bool = True
    avg_latency_ms: Optional[int] = None
    last_health_check: Optional[int] = None
    pay_to: Optional[Dict[str, Dict[str, str]]] = None


@dataclass
class FacilitatorPreferences:
    """User preferences for facilitator selection"""
    preferred_facilitators: List[str] = field(default_factory=list)
    avoid_networks: List[str] = field(default_factory=list)
    max_latency_ms: Optional[int] = None
    preferred_chain: Optional[ChainType] = None


@dataclass
class FacilitatorSelection:
    """Selected facilitator with reasoning"""
    facilitator: FacilitatorConfig
    reason: Literal['preference', 'priority', 'latency', 'fallback']
    alternatives: List[FacilitatorConfig] = field(default_factory=list)


class FacilitatorService:
    """
    Facilitator service for x402 v2 payment facilitator selection

    Manages facilitator preferences and selection for payment processing.
    Fetches configuration from the API for network-agnostic operation.
    """

    def __init__(self, client):
        self.client = client
        self._preferences = FacilitatorPreferences()
        self._cached_facilitators: List[FacilitatorConfig] = []
        self._cached_environment: str = 'testnet'
        self._cached_default_network: str = 'base-sepolia'
        self._last_fetch_time: int = 0
        self._cache_duration_ms = 300000  # 5 minutes

    def set_preferences(self, preferences: Dict[str, Any]) -> None:
        """
        Set facilitator preferences for payment routing

        Args:
            preferences: Dict with optional keys:
                - preferred_facilitators: List of facilitator IDs
                - avoid_networks: List of networks to avoid
                - max_latency_ms: Maximum acceptable latency
                - preferred_chain: 'evm' or 'solana'

        Example:
            ```python
            client.facilitators.set_preferences({
                'preferred_facilitators': ['cdp'],
                'preferred_chain': 'solana',
                'max_latency_ms': 5000,
            })
            ```
        """
        if 'preferred_facilitators' in preferences:
            self._preferences.preferred_facilitators = preferences['preferred_facilitators']
        if 'avoid_networks' in preferences:
            self._preferences.avoid_networks = preferences['avoid_networks']
        if 'max_latency_ms' in preferences:
            self._preferences.max_latency_ms = preferences['max_latency_ms']
        if 'preferred_chain' in preferences:
            self._preferences.preferred_chain = preferences['preferred_chain']

    def get_preferences(self) -> FacilitatorPreferences:
        """Get current facilitator preferences"""
        return self._preferences

    def clear_preferences(self) -> None:
        """Clear facilitator preferences"""
        self._preferences = FacilitatorPreferences()

    async def get_environment(self) -> str:
        """Get the current environment (testnet or mainnet)"""
        await self.list()  # Ensure cache is populated
        return self._cached_environment

    async def get_default_network(self) -> str:
        """Get the default network for the current environment"""
        await self.list()  # Ensure cache is populated
        return self._cached_default_network

    def _get_default_facilitator(self) -> FacilitatorConfig:
        """
        Get the default CDP facilitator configuration (fallback)
        This is used only if API is unavailable
        """
        return FacilitatorConfig(
            id='cdp',
            name='Coinbase Developer Platform',
            chains=['evm', 'solana'],
            networks=['base', 'base-sepolia', 'solana', 'solana-devnet'],
            schemes=['exact'],
            priority=100,
            healthy=True,
        )

    async def list(self, force_refresh: bool = False) -> List[FacilitatorConfig]:
        """
        List all available facilitators
        Fetches from API and caches for performance.

        Args:
            force_refresh: Force refresh from API

        Returns:
            List of facilitator configurations

        Example:
            ```python
            facilitators = await client.facilitators.list()

            for f in facilitators:
                print(f"{f.name}: {f.chains}")
            ```
        """
        now = int(time.time() * 1000)

        # Check cache
        if (
            self._cached_facilitators
            and not force_refresh
            and (now - self._last_fetch_time) < self._cache_duration_ms
        ):
            return self._cached_facilitators

        try:
            # Fetch from API
            response = await self.client._request('GET', '/v1/facilitators')
            data = response.data

            if data and 'facilitators' in data:
                self._cached_facilitators = [
                    FacilitatorConfig(
                        id=f['id'],
                        name=f['name'],
                        chains=f['chains'],
                        networks=f['networks'],
                        schemes=f['schemes'],
                        priority=f['priority'],
                        healthy=f.get('healthy', True),
                        avg_latency_ms=f.get('avgLatencyMs'),
                        last_health_check=f.get('lastHealthCheck'),
                        pay_to=f.get('payTo'),
                    )
                    for f in data['facilitators']
                ]
                self._cached_environment = data.get('environment', 'testnet')
                self._cached_default_network = data.get('defaultNetwork', 'base-sepolia')
                self._last_fetch_time = now
                return self._cached_facilitators

        except Exception as e:
            print(f"[FacilitatorService] Failed to fetch facilitators from API, using fallback: {e}")

        # Fallback to default if API fails
        if not self._cached_facilitators:
            self._cached_facilitators = [self._get_default_facilitator()]
            self._last_fetch_time = now

        return self._cached_facilitators

    async def get(self, facilitator_id: str) -> Optional[FacilitatorConfig]:
        """
        Get facilitator by ID

        Args:
            facilitator_id: Facilitator identifier

        Returns:
            Facilitator configuration or None if not found

        Example:
            ```python
            facilitator = await client.facilitators.get("cdp")
            if facilitator:
                print(f"Found: {facilitator.name}")
            ```
        """
        facilitators = await self.list()
        return next(
            (f for f in facilitators if f.id == facilitator_id), None
        )

    async def select(
        self,
        chain: ChainType,
        network: Optional[str] = None,
        scheme: PaymentScheme = 'exact',
    ) -> Optional[FacilitatorSelection]:
        """
        Select optimal facilitator based on criteria

        Args:
            chain: Blockchain chain (evm, solana)
            network: Network ID (base, base-sepolia, solana-devnet, etc.)
            scheme: Payment scheme (exact)

        Returns:
            Selected facilitator with reason, or None if no match

        Example:
            ```python
            selection = await client.facilitators.select(
                chain="evm",
                network="base-sepolia"
            )

            if selection:
                print(f"Selected: {selection.facilitator.name}")
                print(f"Reason: {selection.reason}")
            ```
        """
        facilitators = await self.list()

        # Default network based on environment
        if network is None:
            if chain == 'solana':
                network = 'solana' if self._cached_environment == 'mainnet' else 'solana-devnet'
            else:
                network = self._cached_default_network

        # Filter by requirements
        candidates = [
            f for f in facilitators
            if chain in f.chains
            and network in f.networks
            and scheme in f.schemes
            and f.healthy is not False
        ]

        if not candidates:
            return None

        # Apply preferences
        if self._preferences.avoid_networks:
            candidates = [
                f for f in candidates
                if not any(n in f.networks for n in self._preferences.avoid_networks)
            ]

        if self._preferences.preferred_facilitators:
            preferred = [
                f for f in candidates
                if f.id in self._preferences.preferred_facilitators
            ]
            if preferred:
                candidates = preferred

        if self._preferences.max_latency_ms:
            within_latency = [
                f for f in candidates
                if f.avg_latency_ms is None or f.avg_latency_ms <= self._preferences.max_latency_ms
            ]
            if within_latency:
                candidates = within_latency

        # Sort by priority (descending) then latency (ascending)
        def sort_key(f: FacilitatorConfig) -> tuple:
            latency = f.avg_latency_ms if f.avg_latency_ms is not None else float('inf')
            return (-f.priority, latency)

        candidates.sort(key=sort_key)

        selected = candidates[0]
        alternatives = candidates[1:]

        # Determine selection reason
        reason: Literal['preference', 'priority', 'latency', 'fallback'] = 'priority'
        if selected.id in self._preferences.preferred_facilitators:
            reason = 'preference'
        elif len(candidates) > 1 and selected.avg_latency_ms is not None:
            reason = 'latency'
        elif len(candidates) == 1:
            reason = 'fallback'

        return FacilitatorSelection(
            facilitator=selected,
            reason=reason,
            alternatives=alternatives,
        )

    async def supports(
        self,
        facilitator_id: str,
        chain: ChainType,
        network: str,
        scheme: PaymentScheme = 'exact',
    ) -> bool:
        """
        Check if a specific facilitator supports the given requirements

        Args:
            facilitator_id: Facilitator ID
            chain: Chain type
            network: Network ID
            scheme: Payment scheme

        Returns:
            True if supported
        """
        facilitator = await self.get(facilitator_id)
        if not facilitator:
            return False

        return (
            chain in facilitator.chains
            and network in facilitator.networks
            and scheme in facilitator.schemes
            and facilitator.healthy is not False
        )

    def clear_cache(self):
        """Clear facilitator cache to force refresh on next list()"""
        self._cached_facilitators = []
        self._last_fetch_time = 0
