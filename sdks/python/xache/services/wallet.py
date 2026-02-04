"""Wallet Service - Balance queries and Coinbase Onramp integration for agent funding"""

from dataclasses import dataclass
from typing import Optional, Literal, List
from urllib.parse import urlencode
import json

import aiohttp

# Type aliases
WalletNetwork = Literal["base", "base-sepolia", "solana", "solana-devnet"]


@dataclass
class WalletBalance:
    """USDC balance response"""
    balance: float  # Human-readable balance (e.g., 10.50)
    balance_raw: str  # Balance in atomic units (6 decimals for USDC)
    address: str  # Wallet address
    network: WalletNetwork  # Network queried


@dataclass
class FundingStatus:
    """Funding check response"""
    needs_funding: bool  # Whether wallet needs funding
    balance: float  # Current balance
    threshold: float  # Threshold used for check
    network: WalletNetwork  # Network checked
    address: str  # Wallet address


# USDC contract addresses
USDC_ADDRESSES = {
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "solana": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "solana-devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
}

# RPC endpoints
RPC_ENDPOINTS = {
    "base": "https://mainnet.base.org",
    "base-sepolia": "https://sepolia.base.org",
    "solana": "https://api.mainnet-beta.solana.com",
    "solana-devnet": "https://api.devnet.solana.com",
}


class WalletService:
    """
    Wallet service for balance queries and funding

    Example:
        ```python
        async with XacheClient(did=did, private_key=key) as client:
            # Check balance
            balance = await client.wallet.get_balance("base-sepolia")
            print(f"Balance: ${balance.balance}")

            # Get Coinbase Onramp URL
            if balance.balance < 1:
                url = await client.wallet.get_onramp_url(amount=10)
                print(f"Fund wallet: {url}")

            # Check if funding needed
            status = await client.wallet.needs_funding(threshold=5)
            if status.needs_funding:
                print("Wallet needs funding!")
        ```
    """

    def __init__(self, client):
        self.client = client

    async def get_balance(self, network: Optional[WalletNetwork] = None) -> WalletBalance:
        """
        Get USDC balance on the specified network

        Args:
            network: Network to query (defaults based on DID chain type)

        Returns:
            Balance information

        Example:
            ```python
            balance = await client.wallet.get_balance("base-sepolia")
            print(f"Have: ${balance.balance:.6f} USDC")
            print(f"Address: {balance.address}")
            ```
        """
        address, chain_type = self._parse_address(self.client.did)

        # Default network based on DID chain type
        target_network = network or self._get_default_network(chain_type)

        # Validate network matches chain type
        self._validate_network_for_chain(target_network, chain_type)

        if target_network in ("solana", "solana-devnet"):
            return await self._get_solana_balance(address, target_network)
        else:
            return await self._get_evm_balance(address, target_network)

    async def get_onramp_url(
        self,
        amount: Optional[float] = None,
        network: Optional[Literal["base", "solana"]] = None,
        currency: Literal["USD", "EUR", "GBP"] = "USD",
    ) -> str:
        """
        Get Coinbase Onramp URL for funding the wallet

        Returns a URL that opens Coinbase Onramp pre-filled with the wallet
        address and USDC as the destination asset.

        Args:
            amount: Suggested USD amount (optional)
            network: Destination network: 'base' or 'solana'
            currency: Fiat currency (default: 'USD')

        Returns:
            Coinbase Onramp URL

        Example:
            ```python
            url = await client.wallet.get_onramp_url(amount=25, network="base")
            print(f"Fund your wallet: {url}")
            ```
        """
        address, chain_type = self._parse_address(self.client.did)

        # Determine network - default based on chain type
        target_network = network or ("solana" if chain_type == "sol" else "base")

        # Build Coinbase Onramp URL
        params = {
            "appId": "xache-protocol",
            "addresses": json.dumps({address: [target_network]}),
            "assets": json.dumps(["USDC"]),
        }

        if amount:
            params["presetFiatAmount"] = str(amount)

        if currency != "USD":
            params["fiatCurrency"] = currency

        return f"https://pay.coinbase.com/buy/select-asset?{urlencode(params)}"

    async def needs_funding(
        self,
        threshold: float = 1.0,
        network: Optional[WalletNetwork] = None,
    ) -> FundingStatus:
        """
        Check if wallet needs funding based on threshold

        Args:
            threshold: USD threshold below which funding is needed (default: 1.0)
            network: Specific network to check, or check default based on DID

        Returns:
            Funding status with balance and threshold info

        Example:
            ```python
            status = await client.wallet.needs_funding(threshold=5)
            if status.needs_funding:
                print(f"Balance ${status.balance} below ${status.threshold}")
                url = await client.wallet.get_onramp_url(amount=10)
                print(f"Please fund: {url}")
            ```
        """
        _, chain_type = self._parse_address(self.client.did)

        # Determine network
        target_network = network or self._get_default_network(chain_type)

        # Get balance
        balance_info = await self.get_balance(target_network)

        return FundingStatus(
            needs_funding=balance_info.balance < threshold,
            balance=balance_info.balance,
            threshold=threshold,
            network=target_network,
            address=balance_info.address,
        )

    async def get_all_balances(self) -> List[WalletBalance]:
        """
        Get balance on all supported networks for this wallet

        Returns:
            List of balances across networks

        Example:
            ```python
            balances = await client.wallet.get_all_balances()
            for b in balances:
                print(f"{b.network}: ${b.balance}")
            ```
        """
        _, chain_type = self._parse_address(self.client.did)

        results = []
        if chain_type == "sol":
            for network in ("solana", "solana-devnet"):
                try:
                    balance = await self.get_balance(network)
                    results.append(balance)
                except Exception:
                    pass
        else:
            for network in ("base", "base-sepolia"):
                try:
                    balance = await self.get_balance(network)
                    results.append(balance)
                except Exception:
                    pass

        return results

    # ========== Private Methods ==========

    def _parse_address(self, did: str) -> tuple:
        """Parse DID to extract address and chain type"""
        # DID format: did:agent:<evm|sol>:<address>
        parts = did.split(":")
        if len(parts) < 4:
            raise ValueError(f"Invalid DID format: {did}")

        chain_type = parts[2]
        address = parts[3]

        if chain_type not in ("evm", "sol"):
            raise ValueError(f"Unknown chain type in DID: {chain_type}")

        return address, chain_type

    def _get_default_network(self, chain_type: str) -> WalletNetwork:
        """Get default network based on chain type"""
        # Default to testnet for safety
        return "solana-devnet" if chain_type == "sol" else "base-sepolia"

    def _validate_network_for_chain(self, network: WalletNetwork, chain_type: str):
        """Validate network is compatible with chain type"""
        is_solana_network = network in ("solana", "solana-devnet")
        is_evm_network = network in ("base", "base-sepolia")

        if chain_type == "sol" and is_evm_network:
            raise ValueError(
                f"Cannot query EVM network '{network}' with Solana DID. "
                "The DID address is a Solana public key."
            )

        if chain_type == "evm" and is_solana_network:
            raise ValueError(
                f"Cannot query Solana network '{network}' with EVM DID. "
                "The DID address is an Ethereum address."
            )

    async def _get_evm_balance(
        self, address: str, network: Literal["base", "base-sepolia"]
    ) -> WalletBalance:
        """Get USDC balance on EVM (Base)"""
        rpc_url = RPC_ENDPOINTS[network]
        usdc_address = USDC_ADDRESSES[network]

        # ERC-20 balanceOf call data: balanceOf(address) = 0x70a08231 + padded address
        call_data = f"0x70a08231000000000000000000000000{address[2:].lower()}"

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [{"to": usdc_address, "data": call_data}, "latest"],
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                rpc_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status != 200:
                    raise Exception(f"RPC request failed: {response.status}")

                result = await response.json()

                if "error" in result:
                    raise Exception(f"RPC error: {result['error']}")

                balance_hex = result.get("result", "0x0")
                balance_raw = int(balance_hex, 16)
                balance = balance_raw / 1_000_000  # USDC has 6 decimals

                return WalletBalance(
                    balance=balance,
                    balance_raw=str(balance_raw),
                    address=address,
                    network=network,
                )

    async def _get_solana_balance(
        self, address: str, network: Literal["solana", "solana-devnet"]
    ) -> WalletBalance:
        """Get USDC balance on Solana"""
        rpc_url = RPC_ENDPOINTS[network]
        usdc_mint = USDC_ADDRESSES[network]

        # Get token accounts by owner with USDC mint filter
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenAccountsByOwner",
            "params": [
                address,
                {"mint": usdc_mint},
                {"encoding": "jsonParsed"},
            ],
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                rpc_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status != 200:
                    raise Exception(f"RPC request failed: {response.status}")

                result = await response.json()

                if "error" in result:
                    raise Exception(f"RPC error: {result['error']}")

                accounts = result.get("result", {}).get("value", [])

                if not accounts:
                    # No token account = zero balance
                    return WalletBalance(
                        balance=0,
                        balance_raw="0",
                        address=address,
                        network=network,
                    )

                # Get balance from first account
                account_data = accounts[0].get("account", {}).get("data", {})
                parsed = account_data.get("parsed", {}).get("info", {})
                token_amount = parsed.get("tokenAmount", {})

                balance_raw = token_amount.get("amount", "0")
                balance = int(balance_raw) / 1_000_000  # USDC has 6 decimals

                return WalletBalance(
                    balance=balance,
                    balance_raw=balance_raw,
                    address=address,
                    network=network,
                )
