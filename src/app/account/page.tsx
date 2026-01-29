"use client";

import CustomerHub from "@/components/modules/CustomerHub";
import { useAuth } from "@/contexts/AuthProvider";

export default function AccountPage() {
  const { customer, initializing } = useAuth();

  if (initializing || !customer) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <CustomerHub layout="page" />
    </div>
  );
}
