"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";

interface WalletBalanceProps {
    showExpiring?: boolean;
    className?: string;
    compact?: boolean;
}

/**
 * WalletBalance Component
 * 
 * Displays the customer's current coin balance with optional expiring warning.
 * Uses the /api/store/wallet endpoint to fetch balance.
 */
export default function WalletBalance({
    showExpiring = false,
    className = "",
    compact = false
}: WalletBalanceProps) {
    const { customer } = useAuth();
    const [balance, setBalance] = useState<number>(0);
    const [expiringSoon, setExpiringSoon] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWallet = async () => {
            if (!customer?.id) {
                setBalance(0);
                setExpiringSoon(0);
                setLoading(false);
                return;
            }

            try {
                const res = await fetch("/api/store/wallet", {
                    headers: { "x-customer-id": customer.id },
                    credentials: "include",
                });

                if (res.ok) {
                    const data = await res.json();
                    setBalance(data.balance || 0);
                    setExpiringSoon(data.expiring_soon || 0);
                }
            } catch (error) {
                console.error("Failed to fetch wallet:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchWallet();
    }, [customer?.id]);

    // Don't render if no customer or still loading
    if (!customer || loading) {
        return null;
    }

    // Don't show if balance is 0
    if (balance === 0) {
        return null;
    }

    if (compact) {
        return (
            <Link href="/my-reward" className={`flex items-center gap-1 text-amber-600 hover:opacity-80 transition-opacity ${className}`}>
                <img src="/uploads/coin/coin.png" alt="Coin" className="w-5 h-5 inline-block object-contain" />
                <span className="text-xs font-medium">{balance.toFixed(0)}</span>
            </Link>
        );
    }

    return (
        <Link href="/my-reward" className={`flex flex-col items-end hover:opacity-80 transition-opacity ${className}`}>
            <div className="flex items-center gap-1.5 text-amber-600">
                <img src="/uploads/coin/coin.png" alt="Coin" className="w-5 h-5 inline-block object-contain" />
                <span className="text-sm font-semibold">{balance.toFixed(0)} coins</span>
            </div>
            {showExpiring && expiringSoon > 0 && (
                <p className="text-xs text-red-500">
                    ⏰ {expiringSoon.toFixed(0)} expiring soon
                </p>
            )}
        </Link>
    );
}
