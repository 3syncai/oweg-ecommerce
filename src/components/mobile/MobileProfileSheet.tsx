"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Facebook,
  FileText,
  Heart,
  HelpCircle,
  Info,
  Instagram,
  Linkedin,
  Lock,
  LogOut,
  Mail,
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
  X,
} from "lucide-react";

type ProfileLink = { label: string; href: string };

const accountLinks: ProfileLink[] = [
  { label: "Brands", href: "/brands" },
  { label: "My Reward", href: "/my-reward" },
  { label: "My Wishlist", href: "/wishlist" },
];

const policyLinks: ProfileLink[] = [
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Returns Policy", href: "/returns-policy" },
  { label: "Shipping Policy", href: "/shipping-policy" },
  { label: "Coupon Code Policy", href: "/coupon-policy" },
  { label: "Reward", href: "/reward-policy" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

const quickLinks: ProfileLink[] = [
  { label: "About Us", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Seller Registration", href: "/seller-registration" },
  { label: "Agent Registration", href: "/agent-registration" },
];

const iconTone = "h-4 w-4 text-[var(--oweg-green-dark)]";

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="oweg-icon-tile flex h-10 w-10 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function accountIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("brand")) return <Store className={iconTone} />;
  if (lower.includes("reward")) return <Trophy className={iconTone} />;
  if (lower.includes("wishlist")) return <Heart className={iconTone} />;
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
      className="flex min-h-[48px] items-center gap-3 px-3.5 py-2.5 transition-colors active:bg-[var(--oweg-surface-tint)]"
    >
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--oweg-ink)]">
        {label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--oweg-ink-muted)]" />
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
      <p className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--oweg-ink-muted)]">
        {title}
      </p>
      <div className="oweg-surface-card overflow-hidden divide-y divide-[var(--oweg-border)]">
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
    "oweg-surface-card flex min-h-[88px] flex-col items-center justify-center gap-2 p-3 text-center transition active:scale-[0.98] active:bg-[var(--oweg-surface-tint)]";

  const body = (
    <>
      <span className="oweg-icon-tile flex h-12 w-12 items-center justify-center">
        {icon}
      </span>
      <span className="text-xs font-semibold text-[var(--oweg-ink)]">{label}</span>
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
    <div className="-mx-4 min-h-full space-y-5 bg-[var(--oweg-surface-subtle)] px-5 pb-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          aria-label="Close profile"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--oweg-border)] bg-white text-[var(--oweg-ink)] shadow-sm transition active:scale-[0.97]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Header card */}
      <header className="rounded-[var(--oweg-radius-lg)] border border-[rgba(122,201,67,0.22)] bg-[var(--oweg-surface-tint)]/90 px-4 py-4 backdrop-blur-sm">
        <h1 className="text-xl font-bold tracking-tight text-[var(--oweg-ink)] sm:text-2xl">
          {customer ? `Hi, ${customerName}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-[var(--oweg-ink-muted)]">
          Deliver to {deliverLocation}
        </p>

        {!customer ? (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="oweg-tap flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--oweg-radius-sm)] bg-[var(--oweg-green)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--oweg-green-dark)]"
              onClick={onLogin}
            >
              Login
            </button>
            <button
              type="button"
              className="oweg-tap flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--oweg-radius-sm)] border border-[var(--oweg-border-strong)] bg-white px-4 text-sm font-semibold text-[var(--oweg-green-dark)] transition hover:bg-[var(--oweg-surface-tint)]"
              onClick={onSignup}
            >
              Sign up
            </button>
          </div>
        ) : null}
      </header>

      {/* Quick actions 2x2 */}
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--oweg-ink-muted)]">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-3">
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
      </section>

      <LinkSection
        title="My Account"
        links={accountLinks}
        iconFor={accountIcon}
        onNavigate={onClose}
      />
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

      {/* Support footer */}
      <section className="oweg-surface-card space-y-3 p-4 text-sm text-[var(--oweg-ink-muted)]">
        <p className="font-semibold text-[var(--oweg-ink)]">Support</p>
        <p>Ascent Retechno India Pvt Ltd</p>
        <p className="leading-relaxed">
          Shop No.04, 05, 06 &amp; 07 AV Crystal, Near Navneet Hospital, Opp.
          Achole Talav, Nallasopara East, Palghar, Maharashtra - 401209.
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
            { label: "Facebook", Icon: Facebook },
            { label: "Twitter", Icon: Twitter },
            { label: "Instagram", Icon: Instagram },
            { label: "LinkedIn", Icon: Linkedin },
          ].map(({ label, Icon }) => (
            <a
              key={label}
              href="#"
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
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--oweg-radius-sm)] border border-red-300 bg-transparent px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      ) : null}
    </div>
  );
}
