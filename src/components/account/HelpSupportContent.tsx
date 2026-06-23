"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
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
  const [tickets, setTickets] = useState<ReturnRequestTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!customer?.id) return;
    setTicketsLoading(true);
    try {
      const res = await fetch("/api/medusa/return-requests", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        setTickets([]);
        return;
      }
      const data = await res.json();
      const list = (data.return_requests || []) as ReturnRequestTicket[];
      setTickets(
        list
          .slice()
          .sort((a, b) => {
            const aTime = new Date(a.created_at || 0).getTime();
            const bTime = new Date(b.created_at || 0).getTime();
            return bTime - aTime;
          })
          .slice(0, 5)
      );
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

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
        <p className="mt-3 text-sm text-gray-500">
          WhatsApp:{" "}
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#66C940] hover:underline"
          >
            +91 8797787877
          </a>
        </p>
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

        {ticketsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your tickets…
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
