"use client";

import Link from "next/link";
import CustomerHub from "@/components/modules/CustomerHub";
import { useAuth } from "@/contexts/AuthProvider";

export default function AccountPage() {
  const { customer, initializing } = useAuth();

  if (initializing) return null;

  if (!customer) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-xl font-semibold text-slate-900 mb-2">Sign in to view your account</p>
          <p className="text-sm text-slate-500 mb-5">
            Please log in to access your profile, addresses, and account details.
          </p>
          <Link
            href="/login?redirect=/account"
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <CustomerHub layout="page" />
    </div>
  );
}
