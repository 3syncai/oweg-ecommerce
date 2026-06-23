"use client";

import Link from "next/link";

type AccountLoginPromptProps = {
  redirect?: string;
  title?: string;
  description?: string;
};

export default function AccountLoginPrompt({
  redirect = "/account",
  title = "Sign in to view your account",
  description = "Please log in to access your profile, orders, addresses, and account details.",
}: AccountLoginPromptProps) {
  const loginHref = `/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-10">
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <p className="text-xl font-semibold text-[#1F2A33] mb-2">{title}</p>
        <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">{description}</p>
        <Link
          href={loginHref}
          className="inline-flex items-center justify-center rounded-full bg-[#66C940] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#5ab838] transition-colors"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
