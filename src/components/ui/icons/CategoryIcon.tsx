"use client";

import React from "react";

export type CategoryIconKey =
  | "home-appliances"
  | "computer-mobile"
  | "clothing"
  | "hardware"
  | "toys-games"
  | "beauty"
  | "kitchen-appliances"
  | "surveillance"
  | "bags"
  | "health-care"
  | "stationery"
  | "jewellery"
  | "default";

type IconProps = {
  className?: string;
};

const strokeProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeAppliancesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" {...strokeProps} />
      <line x1="5" y1="10" x2="19" y2="10" {...strokeProps} />
      <line x1="8" y1="5.5" x2="8" y2="7.5" {...strokeProps} />
      <line x1="8" y1="13" x2="8" y2="17" {...strokeProps} />
    </svg>
  );
}

function ComputerMobileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* Smartphone */}
      <rect x="4" y="3" width="8" height="14" rx="1.5" {...strokeProps} />
      <circle cx="8" cy="14.5" r="0.75" fill="currentColor" stroke="none" />
      <line x1="6.5" y1="5.5" x2="9.5" y2="5.5" {...strokeProps} />
      {/* Laptop */}
      <rect x="13" y="7" width="8" height="5.5" rx="1" {...strokeProps} />
      <path d="M12 13.5h10" {...strokeProps} />
      <path d="M13.5 13.5l-1 1.5h9l-1-1.5" {...strokeProps} />
    </svg>
  );
}

function ClothingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6.5 4.5L9 7h6l2.5-2.5L20 8l-2.5 2V20H6.5V10L4 8z" {...strokeProps} />
      <path d="M9 7v2" {...strokeProps} />
      <path d="M15 7v2" {...strokeProps} />
    </svg>
  );
}

function HardwareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14.5 4.5l5 5-7 7H7.5v-5z" {...strokeProps} />
      <path d="M12.5 6.5l5 5" {...strokeProps} />
      <path d="M4 20l3-3" {...strokeProps} />
    </svg>
  );
}

function ToysGamesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 5.5c-2.2 0-4 1.5-4 3.5 0 1.2.6 2.2 1.5 2.8V14h5v-2.2c.9-.6 1.5-1.6 1.5-2.8 0-2-1.8-3.5-4-3.5z"
        {...strokeProps}
      />
      <path d="M8 14h8v3.5a2.5 2.5 0 01-5 0V14z" {...strokeProps} />
      <circle cx="10.5" cy="9" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="9" r="0.75" fill="currentColor" stroke="none" />
      <path d="M10.5 10.5c.8.5 1.7.5 2.5 0" {...strokeProps} />
    </svg>
  );
}

function BeautyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="3" width="4" height="14" rx="1" {...strokeProps} />
      <path d="M5 7h4" {...strokeProps} />
      <path d="M14 4l4 16" {...strokeProps} />
      <path d="M12 8l2 8" {...strokeProps} />
    </svg>
  );
}

function KitchenAppliancesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 10h12v9a2 2 0 01-2 2H8a2 2 0 01-2-2v-9z" {...strokeProps} />
      <path d="M8 10V8a4 4 0 018 0v2" {...strokeProps} />
      <path d="M10 14h4" {...strokeProps} />
    </svg>
  );
}

function SurveillanceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 8h11l4 3v5H4V8z" {...strokeProps} />
      <circle cx="9.5" cy="12.5" r="2.5" {...strokeProps} />
      <path d="M4 16v2" {...strokeProps} />
      <path d="M19 16v2" {...strokeProps} />
    </svg>
  );
}

function BagsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 9V7a5 5 0 0110 0v2" {...strokeProps} />
      <rect x="5" y="9" width="14" height="12" rx="2" {...strokeProps} />
      <path d="M9 13h6" {...strokeProps} />
    </svg>
  );
}

function HealthCareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 20.5c-4.5-3.2-7-6.2-7-9.5a4 4 0 017.5-2.2A4 4 0 0119 11c0 3.3-2.5 6.3-7 9.5z"
        {...strokeProps}
      />
      <path d="M12 9v4" {...strokeProps} />
      <path d="M10 11h4" {...strokeProps} />
    </svg>
  );
}

function StationeryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 4l6 6-9 9H5v-6z" {...strokeProps} />
      <path d="M14 4l2 2" {...strokeProps} />
      <path d="M5 19l3-3" {...strokeProps} />
    </svg>
  );
}

function JewelleryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="15" r="5" {...strokeProps} />
      <path d="M9 10l3-6 3 6" {...strokeProps} />
      <path d="M12 15l1.5 2.5" {...strokeProps} />
    </svg>
  );
}

function DefaultCategoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" {...strokeProps} />
      <rect x="13" y="4" width="7" height="7" rx="1.5" {...strokeProps} />
      <rect x="4" y="13" width="7" height="7" rx="1.5" {...strokeProps} />
      <rect x="13" y="13" width="7" height="7" rx="1.5" {...strokeProps} />
    </svg>
  );
}

const ICON_COMPONENTS: Record<CategoryIconKey, React.FC<IconProps>> = {
  "home-appliances": HomeAppliancesIcon,
  "computer-mobile": ComputerMobileIcon,
  clothing: ClothingIcon,
  hardware: HardwareIcon,
  "toys-games": ToysGamesIcon,
  beauty: BeautyIcon,
  "kitchen-appliances": KitchenAppliancesIcon,
  surveillance: SurveillanceIcon,
  bags: BagsIcon,
  "health-care": HealthCareIcon,
  stationery: StationeryIcon,
  jewellery: JewelleryIcon,
  default: DefaultCategoryIcon,
};

const HANDLE_ICON_MAP: Record<string, CategoryIconKey> = {
  "home-appliances": "home-appliances",
  "kitchen-appliances": "kitchen-appliances",
  "beauty-personal-care": "beauty",
  "beauty-and-personal-care": "beauty",
  "computer-mobile": "computer-mobile",
  "computer-mobile-accessories": "computer-mobile",
  "computer-and-mobile-accessories": "computer-mobile",
  "computer-mobile-acc": "computer-mobile",
  "mobile-accessories": "computer-mobile",
  hardware: "hardware",
  "hard-wear": "hardware",
  clothing: "clothing",
  "toys-and-games": "toys-games",
  "toys-games": "toys-games",
  "security-surveillance": "surveillance",
  "surveillance-security": "surveillance",
  "surveillance-and-security": "surveillance",
  "security-and-surveillance": "surveillance",
  bags: "bags",
  "health-care": "health-care",
  health: "health-care",
  stationery: "stationery",
  stationary: "stationery",
  jewellery: "jewellery",
  jewelry: "jewellery",
};

const KEYWORD_RULES: Array<{ key: CategoryIconKey; includes: string[] }> = [
  { key: "home-appliances", includes: ["home", "appliance"] },
  { key: "kitchen-appliances", includes: ["kitchen", "appliance"] },
  { key: "computer-mobile", includes: ["computer", "mobile"] },
  { key: "computer-mobile", includes: ["mobile", "accessor"] },
  { key: "computer-mobile", includes: ["computer", "accessor"] },
  { key: "computer-mobile", includes: ["mobile"] },
  { key: "computer-mobile", includes: ["computer"] },
  { key: "beauty", includes: ["beauty"] },
  { key: "beauty", includes: ["personal", "care"] },
  { key: "hardware", includes: ["hardware"] },
  { key: "hardware", includes: ["hard", "wear"] },
  { key: "clothing", includes: ["cloth"] },
  { key: "toys-games", includes: ["toy"] },
  { key: "toys-games", includes: ["game"] },
  { key: "surveillance", includes: ["surveillance"] },
  { key: "surveillance", includes: ["security"] },
  { key: "bags", includes: ["bag"] },
  { key: "health-care", includes: ["health"] },
  { key: "stationery", includes: ["stationery"] },
  { key: "stationery", includes: ["stationary"] },
  { key: "jewellery", includes: ["jewel"] },
];

export function normalizeCategorySlug(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCategoryTokens(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function resolveCategoryIconKey(handle?: string, title?: string): CategoryIconKey {
  const slug = normalizeCategorySlug(handle || title);
  if (slug && HANDLE_ICON_MAP[slug]) {
    return HANDLE_ICON_MAP[slug];
  }

  const tokens = normalizeCategoryTokens(`${handle || ""} ${title || ""}`);
  if (tokens.length) {
    for (const rule of KEYWORD_RULES) {
      if (rule.includes.every((part) => tokens.some((token) => token.includes(part) || part.includes(token)))) {
        return rule.key;
      }
    }
  }

  return "default";
}

type CategoryIconProps = IconProps & {
  handle?: string;
  title?: string;
  iconKey?: CategoryIconKey;
  active?: boolean;
};

export default function CategoryIcon({
  className = "w-5 h-5",
  handle,
  title,
  iconKey,
  active = false,
}: CategoryIconProps) {
  const resolvedKey = iconKey ?? resolveCategoryIconKey(handle, title);
  const Icon = ICON_COMPONENTS[resolvedKey] ?? DefaultCategoryIcon;

  return (
    <Icon
      className={`shrink-0 transition-colors ${active ? "text-header-accent" : "text-header-muted group-hover:text-header-accent"} ${className}`}
    />
  );
}
