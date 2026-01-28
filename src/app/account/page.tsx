"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import CustomerHub from "@/components/modules/CustomerHub";
import { useAuth } from "@/contexts/AuthProvider";

export default function AccountPage() {
  const { customer } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (customer === null) {
      router.push("/login?redirect=/account");
    }
  }, [customer, router]);

  if (!customer) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <CustomerHub layout="page" />
    </div>
  );
}
