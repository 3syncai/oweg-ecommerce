"use client";

import BrandLoader from "@/components/ui/BrandLoader";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { useAuth } from "@/contexts/AuthProvider";
import { cn } from "@/lib/utils";

type HelpSupportContentProps = {
  embedded?: boolean;
};

type ReturnRequestTicket = {
  id: string;
  order_id: string;
  status: string;
  type: string;
  created_at?: string;
};

const WHATSAPP_NUMBER = "918797787877";
const SUPPORT_EMAIL = "owegonline@oweg.in";

const QUICK_HELP_TILES = [
  {
    label: "Track orders",
    description: "View status and delivery updates",
    href: "/account/orders",
    icon: "package" as const,
  },
  {
    label: "Browse FAQ",
    description: "Answers to common questions",
    href: "/faq",
    icon: "faq" as const,
  },
  {
    label: "Chat on WhatsApp",
    description: "Quick help from our team",
    href: `https://wa.me/${WHATSAPP_NUMBER}`,
    icon: "whatsapp-message" as const,
    external: true,
  },
];

const POPULAR_QUESTIONS = [
  { label: "How do I track my order?", href: "/faq" },
  { label: "What is the return policy?", href: "/faq" },
  { label: "How do I cancel an order?", href: "/faq" },
  { label: "Payment and refund help", href: "/faq" },
];

function formatTicketStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTicketDate(value?: string): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function HelpSupportContent({ embedded = false }: HelpSupportContentProps) {
  const { customer } = useAuth();
  const customerId = customer?.id;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    customerId: string;
    attempt: number;
    tickets: ReturnRequestTicket[] | null;
  } | null>(null);
  const currentResult = result?.customerId === customerId && result?.attempt === attempt ? result : null;
  const tickets = currentResult?.tickets ?? [];

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();

    async function loadTickets(id: string) {
      try {
        const res = await fetch("/api/medusa/return-requests", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not load return requests");
        const data = await res.json();
        if (!Array.isArray(data?.return_requests)) throw new Error("Invalid return requests response");
        const list = (data.return_requests as ReturnRequestTicket[]).slice()
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 5);
        if (!controller.signal.aborted) setResult({ customerId: id, attempt, tickets: list });
      } catch {
        if (!controller.signal.aborted) setResult({ customerId: id, attempt, tickets: null });
      }
    }

    void loadTickets(customerId);
    return () => controller.abort();
  }, [customerId, attempt]);

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect="/account/help"
        title="Sign in for help & support"
        description="Please log in to view your support tickets and contact options."
      />
    );
  }

  const wrapperClass = embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="help-and-support" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Help & Support</h1>
            <p className="text-sm text-gray-600">We are here when you need us.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_HELP_TILES.map((tile) => {
          const className =
            "group flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#66C940] hover:shadow-md";
          const inner = (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF8E7] transition group-hover:bg-[#dff5d8]">
                <AccountHubIcon name={tile.icon} size={22} className="h-[22px] w-[22px]" />
              </div>
              <p className="mt-3 font-semibold text-[#1F2A33]">{tile.label}</p>
              <p className="mt-1 text-sm text-gray-500">{tile.description}</p>
            </>
          );

          if (tile.external) {
            return (
              <a
                key={tile.label}
                href={tile.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {inner}
              </a>
            );
          }

          return (
            <Link key={tile.label} href={tile.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AccountHubIcon name="account-help" size={20} className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#1F2A33]">Contact us</h3>
        </div>
        <p className="text-sm text-gray-600">
          Reach our support team by email and we will get back to you as soon as possible.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#66C940]/30 bg-[#EAF8E7] px-4 py-2.5 text-sm font-semibold text-[#66C940] transition hover:bg-[#dff5d8]"
        >
          <Mail className="h-4 w-4" />
          {SUPPORT_EMAIL}
        </a>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AccountHubIcon name="faq" size={20} className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#1F2A33]">Popular questions</h3>
        </div>
        <div className="space-y-2">
          {POPULAR_QUESTIONS.map((question) => (
            <Link
              key={question.label}
              href={question.href}
              className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm font-medium text-[#1F2A33] transition hover:border-[#66C940]/40 hover:bg-[#EAF8E7]/40"
            >
              <span>{question.label}</span>
              <AccountHubIcon name="more-options" size={16} className="h-4 w-4 opacity-50" />
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AccountHubIcon name="return-refund" size={20} className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#1F2A33]">Recent tickets</h3>
        </div>

        {!currentResult ? (
          <BrandLoader compact label="Finding your support tickets…" />
        ) : currentResult.tickets === null ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950">
            <p>We couldn’t load your return and replacement requests.</p>
            <button
              type="button"
              onClick={() => setAttempt((previous) => previous + 1)}
              className="mt-2 min-h-11 rounded-lg border border-amber-300 px-4 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-[#FAFAFA] px-4 py-8 text-center">
            <AccountHubIcon name="chat-support" size={32} className="mx-auto h-8 w-8 opacity-60" />
            <p className="mt-3 text-sm font-medium text-[#1F2A33]">No support tickets yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Returns and refund requests will appear here.
            </p>
            <Link
              href="/account/orders"
              className="mt-4 inline-flex rounded-full bg-[#66C940] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5ab838]"
            >
              View orders
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="flex flex-col gap-2 rounded-xl border border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1F2A33]">
                    {ticket.type ? formatTicketStatus(ticket.type) : "Support request"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Order {ticket.order_id} · {formatTicketDate(ticket.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    ticket.status === "approved" || ticket.status === "completed"
                      ? "bg-[#EAF8E7] text-[#66C940]"
                      : "bg-amber-50 text-amber-700"
                  )}
                >
                  {formatTicketStatus(ticket.status || "pending")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
