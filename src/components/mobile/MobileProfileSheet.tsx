"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  ChevronDown,
  Facebook,
  FileText,
  Heart,
  HelpCircle,
  Info,
  Instagram,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Package,
  Percent,
  Phone,
  RefreshCw,
  ShoppingBag,
  Store,
  Tag,
  Trophy,
  Truck,
  Twitter,
  User,
  Users,
  Youtube,
  X,
} from "lucide-react";

import { storefrontPolicyLinks, storefrontQuickLinks } from "@/lib/storefront-links";

type ProfileLink = { label: string; href: string };

const accountLinks: ProfileLink[] = [
  { label: "Notifications", href: "/account/notifications" },
  { label: "Brands", href: "/brands" },
  { label: "Affiliates", href: "/affiliates" },
  { label: "My Reward", href: "/my-reward" },
  { label: "My Wishlist", href: "/wishlist" },
];

const policyLinks = storefrontPolicyLinks;
const quickLinks: ProfileLink[] = [...storefrontQuickLinks, { label: "Agent Registration", href: "/agent-registration" }];

const iconTone = "h-4 w-4 text-[var(--oweg-green-dark)]";

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--oweg-surface-tint)]">
      {children}
    </span>
  );
}

function accountIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("notification")) return <Bell className={iconTone} />;
  if (lower.includes("brand")) return <Store className={iconTone} />;
  if (lower.includes("reward")) return <Trophy className={iconTone} />;
  if (lower.includes("wishlist")) return <Heart className={iconTone} />;
  if (lower.includes("affiliate")) return <Users className={iconTone} />;
  return <Tag className={iconTone} />;
}

function policyIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("return")) return <RefreshCw className={iconTone} />;
  if (lower.includes("shipping")) return <Truck className={iconTone} />;
  if (lower.includes("coupon")) return <Percent className={iconTone} />;
  if (lower.includes("privacy")) return <Lock className={iconTone} />;
  return <FileText className={iconTone} />;
}

function quickIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("about")) return <Info className={iconTone} />;
  if (lower.includes("faq")) return <HelpCircle className={iconTone} />;
  if (lower.includes("contact")) return <Phone className={iconTone} />;
  if (lower.includes("seller")) return <Store className={iconTone} />;
  if (lower.includes("agent")) return <Users className={iconTone} />;
  return <Tag className={iconTone} />;
}

function ProfileLinkRow({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors active:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#145448]"
    >
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--oweg-ink)]">
        {label}
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--oweg-ink-muted)]" />
    </Link>
  );
}

function LinkSection({
  title,
  links,
  iconFor,
  onNavigate,
}: {
  title: string;
  links: ProfileLink[];
  iconFor: (label: string) => ReactNode;
  onNavigate: () => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-bold text-[var(--oweg-ink)]">
        {title}
      </h2>
      <div className="overflow-hidden divide-y divide-[var(--oweg-border)] rounded-xl border border-[var(--oweg-border)] bg-white">
        {links.map((link) => (
          <ProfileLinkRow
            key={link.href}
            href={link.href}
            label={link.label}
            icon={iconFor(link.label)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

function QuickActionTile({
  href,
  label,
  icon,
  onNavigate,
  as = "link",
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onNavigate: () => void;
  as?: "link" | "a";
}) {
  const className =
    "flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--oweg-border)] bg-white px-1 py-2 text-center transition-colors active:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]";

  const body = (
    <>
      <span aria-hidden="true" className="flex size-7 items-center justify-center">
        {icon}
      </span>
      <span className="break-words text-xs font-semibold leading-tight text-[var(--oweg-ink)]">{label}</span>
    </>
  );

  if (as === "a") {
    return (
      <a href={href} onClick={onNavigate} className={className}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onNavigate} className={className}>
      {body}
    </Link>
  );
}

export type MobileProfileSheetProps = {
  customer: unknown;
  customerName: string;
  deliverLocation: string;
  onClose: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onSignOut: () => void | Promise<void>;
};

export default function MobileProfileSheet({
  customer,
  customerName,
  deliverLocation,
  onClose,
  onLogin,
  onSignup,
  onSignOut,
}: MobileProfileSheetProps) {
  const quickTileIcon = "h-5 w-5 text-[var(--oweg-green-dark)]";

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-[var(--oweg-ink)]">Account</h1>
        <button
          type="button"
          aria-label="Close profile"
          onClick={onClose}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--oweg-border)] bg-white text-[var(--oweg-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <header className="rounded-xl border border-[var(--oweg-border)] bg-white p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--oweg-surface-tint)] text-[#145448]">
            <User className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-base font-bold text-[var(--oweg-ink)]">
              {customer ? customerName : "Welcome to OWEG"}
            </h2>
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--oweg-ink-muted)]">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">Deliver to {deliverLocation}</span>
            </p>
          </div>
        </div>

        {!customer ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="oweg-tap min-h-11 rounded-lg bg-[#145448] px-2 text-sm font-semibold text-white hover:bg-[#103e36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]"
              onClick={onLogin}
            >
              Login
            </button>
            <button
              type="button"
              className="oweg-tap min-h-11 rounded-lg border border-[var(--oweg-border-strong)] bg-white px-2 text-sm font-semibold text-[#145448] hover:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]"
              onClick={onSignup}
            >
              Sign up
            </button>
          </div>
        ) : null}
      </header>

      <nav aria-label="Account shortcuts">
        <div className={customer ? "grid grid-cols-4 gap-2" : "grid grid-cols-3 gap-2"}>
          {customer ? (
            <QuickActionTile
              href="/account"
              label="My Profile"
              icon={<User className={quickTileIcon} />}
              onNavigate={onClose}
            />
          ) : null}
          <QuickActionTile
            href="/account/orders"
            label="Orders"
            icon={<Package className={quickTileIcon} />}
            onNavigate={onClose}
          />
          <QuickActionTile
            href="/cart"
            label="Cart"
            icon={<ShoppingBag className={quickTileIcon} />}
            onNavigate={onClose}
          />
          <QuickActionTile
            href="mailto:owegonline@oweg.in"
            label="Support"
            icon={<Phone className={quickTileIcon} />}
            onNavigate={onClose}
            as="a"
          />
        </div>
      </nav>

      <LinkSection
        title="Explore OWEG"
        links={accountLinks}
        iconFor={accountIcon}
        onNavigate={onClose}
      />
      <details className="group/help oweg-surface-card">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-[var(--oweg-radius-lg)] px-4 py-3 text-sm font-semibold text-[var(--oweg-ink)] marker:content-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-[var(--oweg-green)]">
          <HelpCircle className={iconTone} />
          <span className="flex-1">Help &amp; policies</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/help:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-[var(--oweg-border)] p-3">
          <LinkSection
            title="Policy"
            links={policyLinks}
            iconFor={policyIcon}
            onNavigate={onClose}
          />
          <LinkSection
            title="Quick Links"
            links={quickLinks}
            iconFor={quickIcon}
            onNavigate={onClose}
          />
        </div>
      </details>

      {/* Support footer */}
      <section className="oweg-surface-card space-y-3 p-4 text-sm text-[var(--oweg-ink-muted)]">
        <p className="font-semibold text-[var(--oweg-ink)]">Support</p>
        <p>Ascent Retechno India Pvt Ltd</p>
        <p className="leading-relaxed">
          Av Pride, B-12, Ground Floor, Opp. Rahul, International School,
          Nilemore 4th Road, Nalasopara West, Thane, Maharashtra - 401203.
        </p>
        <a
          href="mailto:owegonline@oweg.in"
          className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-[var(--oweg-green-dark)]"
          onClick={onClose}
        >
          <Mail className="h-4 w-4" />
          owegonline@oweg.in
        </a>
        <div className="-ml-2 flex items-center gap-0.5">
          {[
            { label: "Facebook", Icon: Facebook, href: "https://www.facebook.com/owegonline/" },
            { label: "Twitter", Icon: Twitter, href: "https://x.com/owegonline" },
            { label: "Instagram", Icon: Instagram, href: "https://www.instagram.com/owegonline/" },
            { label: "YouTube", Icon: Youtube, href: "https://www.youtube.com/@owegonline" },
          ].map(({ label, Icon, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--oweg-ink-muted)] transition-colors hover:bg-[var(--oweg-surface-tint)] hover:text-[var(--oweg-green-dark)]"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </section>

      {customer ? (
        <button
          type="button"
          onClick={() => {
            void onSignOut();
          }}
          className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[#ebddda] bg-white px-4 text-sm font-semibold text-[#82383a] hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82383a]"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      ) : null}
    </div>
  );
}
