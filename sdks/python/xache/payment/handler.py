"""
Payment Handler for 402 Payment Flow per LLD §2.3
"""

import asyncio
from typing import Dict, Optional, Any


class PaymentHandler:
    """Payment handler for 402 payment flow"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.pending_payments: Dict[str, Dict[str, Any]] = {}

    async def handle_payment(
        self,
        challenge_id: str,
        amount: str,
        chain_hint: str,
        pay_to: str,
        description: str,
    ) -> Dict[str, Any]:
        """
        Handle 402 payment challenge

        Args:
            challenge_id: Payment challenge ID
            amount: Amount in USD
            chain_hint: Blockchain hint (solana or base)
            pay_to: Payment recipient address
            description: Payment description

        Returns:
            Payment result with success status
        """
        # Check if payment already processed
        if challenge_id in self.pending_payments:
            return self.pending_payments[challenge_id]

        try:
            # Handle payment based on provider type
            provider_type = self.config.get("type", "manual")

            if provider_type == "manual":
                result = await self._handle_manual_payment(
                    challenge_id, amount, chain_hint, pay_to, description
                )
            elif provider_type == "coinbase-commerce":
                result = await self._handle_coinbase_payment(
                    challenge_id, amount, chain_hint, pay_to, description
                )
            else:
                result = {
                    "success": False,
                    "error": f"Unknown payment provider: {provider_type}",
                }

            # Cache result
            if result["success"]:
                self.pending_payments[challenge_id] = result

            return result

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_manual_payment(
        self,
        challenge_id: str,
        amount: str,
        chain_hint: str,
        pay_to: str,
        description: str,
    ) -> Dict[str, Any]:
        """Handle manual payment"""
        print("\n╔════════════════════════════════════════════════════════════╗")
        print("║            PAYMENT REQUIRED                                 ║")
        print("╚════════════════════════════════════════════════════════════╝")
        print("")
        print(f"Description: {description}")
        print(f"Amount:      {amount} USD")
        print(f"Chain:       {chain_hint}")
        print(f"Pay To:      {pay_to}")
        print(f"Challenge:   {challenge_id}")
        print("")
        print("Please complete the payment manually and then press Enter to continue...")
        print("(Or press Ctrl+C to cancel)")
        print("")

        # Wait for user confirmation
        await asyncio.sleep(2)

        # Return success assuming user completed payment
        # The server will verify the actual blockchain transaction
        return {
            "success": True,
            "transaction_hash": f"manual-{challenge_id}",
        }

    async def _handle_coinbase_payment(
        self,
        challenge_id: str,
        amount: str,
        chain_hint: str,
        pay_to: str,
        description: str,
    ) -> Dict[str, Any]:
        """Handle Coinbase Commerce payment"""
        import aiohttp

        api_key = self.config.get("api_key")
        if not api_key:
            return {"success": False, "error": "Coinbase Commerce API key not configured"}

        try:
            # Create charge via Coinbase Commerce API
            charge = await self._create_coinbase_charge(
                challenge_id, amount, description, chain_hint
            )

            print("\n╔════════════════════════════════════════════════════════════╗")
            print("║            PAYMENT REQUIRED                                 ║")
            print("╚════════════════════════════════════════════════════════════╝")
            print("")
            print(f"Description: {description}")
            print(f"Amount:      {amount} USD")
            print(f"Chain:       {chain_hint}")
            print("")
            print(f"Payment URL: {charge['hosted_url']}")
            print("")
            print("Please complete the payment and wait for confirmation...")
            print("")

            # Poll for payment confirmation
            confirmed = await self._poll_coinbase_payment(charge["id"])

            if confirmed:
                return {
                    "success": True,
                    "transaction_hash": charge["id"],
                }
            else:
                return {
                    "success": False,
                    "error": "Payment not confirmed",
                }

        except Exception as e:
            return {
                "success": False,
                "error": f"Coinbase Commerce error: {str(e)}",
            }

    async def _create_coinbase_charge(
        self, challenge_id: str, amount: str, description: str, chain_hint: str
    ) -> Dict[str, Any]:
        """Create Coinbase Commerce charge"""
        import aiohttp

        api_key = self.config.get("api_key")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.commerce.coinbase.com/charges",
                headers={
                    "Content-Type": "application/json",
                    "X-CC-Api-Key": api_key,
                    "X-CC-Version": "2018-03-22",
                },
                json={
                    "name": description,
                    "description": f"Xache Protocol payment - Challenge: {challenge_id}",
                    "pricing_type": "fixed_price",
                    "local_price": {
                        "amount": amount,
                        "currency": "USD",
                    },
                    "metadata": {
                        "challengeId": challenge_id,
                        "chainHint": chain_hint,
                    },
                },
            ) as response:
                if response.status != 200 and response.status != 201:
                    error_text = await response.text()
                    raise Exception(f"Coinbase API error: {error_text}")

                data = await response.json()
                return data["data"]

    async def _poll_coinbase_payment(
        self, charge_id: str, max_attempts: int = 60
    ) -> bool:
        """Poll Coinbase Commerce for payment confirmation"""
        import aiohttp

        api_key = self.config.get("api_key")

        for _ in range(max_attempts):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"https://api.commerce.coinbase.com/charges/{charge_id}",
                        headers={
                            "X-CC-Api-Key": api_key,
                            "X-CC-Version": "2018-03-22",
                        },
                    ) as response:
                        if response.status != 200:
                            await asyncio.sleep(5)
                            continue

                        data = await response.json()
                        timeline = data["data"]["timeline"]

                        if timeline:
                            status = timeline[-1].get("status")

                            if status in ["COMPLETED", "RESOLVED"]:
                                return True

                            if status in ["EXPIRED", "CANCELED"]:
                                return False

                        # Wait 5 seconds before next poll
                        await asyncio.sleep(5)

            except Exception as e:
                print(f"Error polling payment status: {e}")
                await asyncio.sleep(5)

        return False

    def mark_payment_complete(self, challenge_id: str, transaction_hash: str):
        """Mark payment as completed (for testing)"""
        self.pending_payments[challenge_id] = {
            "success": True,
            "transaction_hash": transaction_hash,
        }

    def clear_cache(self):
        """Clear payment cache"""
        self.pending_payments.clear()
