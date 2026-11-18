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
  Headphones,
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

import { storefrontAffiliateLink, storefrontPolicyLinks, storefrontQuickLinks, storefrontRegisteredAddress, storefrontRewardLink, storefrontSupport } from "@/lib/storefront-links";

type ProfileLink = { label: string; href: string };

const accountLinks: ProfileLink[] = [
  { label: "Notifications", href: "/account/notifications" },
  storefrontAffiliateLink,
  storefrontRewardLink,
  { label: "My Wishlist", href: "/wishlist" },
];

const policyLinks = storefrontPolicyLinks;
const quickLinks: ProfileLink[] = [...storefrontQuickLinks, { label: "Agent Registration", href: "/agent-registration" }];

const iconTone = "h-4 w-4 text-[var(--oweg-green-dark)]";

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function accountIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("notification")) return <Bell className={iconTone} />;
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
      className="flex min-h-12 items-center gap-3 px-1 py-2 transition-colors hover:bg-[var(--oweg-surface-tint)] active:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#145448]"
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
    <section className="space-y-1">
      <h2 className="px-1 text-sm font-bold tracking-tight text-[#153f34]">
        {title}
      </h2>
      <div className="divide-y divide-[var(--oweg-border)]">
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
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onNavigate: () => void;
}) {
  const className =
    "flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-2 rounded-lg px-1 py-2 text-center transition-colors hover:bg-[var(--oweg-surface-tint)] active:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]";

  const body = (
    <>
      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-[#edf4e9]">
        {icon}
      </span>
      <span className="break-words text-xs font-semibold leading-tight text-[var(--oweg-ink)]">{label}</span>
    </>
  );

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
  const initials = customerName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  const quickTileIcon = "h-5 w-5 text-[var(--oweg-green-dark)]";

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#153f34]">Account</h1>
        <button
          type="button"
          aria-label="Close profile"
          onClick={onClose}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#edf4e9] text-[#153f34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145448]"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <header className="rounded-2xl bg-[#123e34] px-4 py-5 text-white sm:px-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#dcedd2] text-sm font-extrabold text-[#174737]">
            {customer && initials ? initials : <User className="size-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold tracking-tight">
              {customer ? customerName : "Welcome to OWEG"}
            </h2>
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[#d6e9df]">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">Deliver to {deliverLocation}</span>
            </p>
          </div>
        </div>

        {!customer ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="oweg-tap min-h-11 rounded-lg bg-[#dcedd2] px-2 text-sm font-semibold text-[#123e34] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onLogin}
            >
              Login
            </button>
            <button
              type="button"
              className="oweg-tap min-h-11 rounded-lg border border-white/40 px-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onSignup}
            >
              Sign up
            </button>
          </div>
        ) : null}
      </header>

      <nav aria-label="Account shortcuts" className="border-b border-[var(--oweg-border)] pb-4">
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
            href="/account/help"
            label="Support"
            icon={<Headphones className={quickTileIcon} />}
            onNavigate={onClose}
          />
        </div>
      </nav>

      <LinkSection
        title="Explore OWEG"
        links={accountLinks}
        iconFor={accountIcon}
        onNavigate={onClose}
      />
      <details className="group/help border-y border-[var(--oweg-border)]">
        <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 px-1 py-3 text-sm font-semibold text-[var(--oweg-ink)] marker:content-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-[var(--oweg-green)]">
          <HelpCircle className={iconTone} />
          <span className="flex-1">Help &amp; policies</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/help:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-[var(--oweg-border)] px-1 py-4">
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

      <section className="space-y-2 px-1 text-sm text-[var(--oweg-ink-muted)]">
        <h2 className="font-bold text-[#153f34]">Registered Address</h2>
        <address className="space-y-1 leading-relaxed not-italic">
          <p>{storefrontRegisteredAddress.company}</p>
          <p>{storefrontRegisteredAddress.address}</p>
        </address>
      </section>
      <section className="space-y-2 px-1 text-sm text-[var(--oweg-ink-muted)]">
        <h2 className="font-bold text-[#153f34]">Contact support</h2>
        <a
          href={`mailto:${storefrontSupport.email}`}
          className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-[var(--oweg-green-dark)]"
          onClick={onClose}
        >
          <Mail className="h-4 w-4" />
          {storefrontSupport.email}
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
          className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 text-sm font-semibold text-[#82383a] hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82383a]"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      ) : null}
    </div>
  );
}
