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
  | "more"
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

const CATEGORY_SVG_FILES: Record<Exclude<CategoryIconKey, "default">, string> = {
  "home-appliances": "home-appliances.svg",
  "computer-mobile": "computer-mobile-accessories.svg",
  clothing: "clothing.svg",
  hardware: "hardware.svg",
  "toys-games": "toys-games.svg",
  beauty: "beauty-personal-care.svg",
  "kitchen-appliances": "kitchen-appliances.svg",
  surveillance: "surveillance-security.svg",
  bags: "bags.svg",
  "health-care": "health-care.svg",
  stationery: "stationery.svg",
  jewellery: "jewellery.svg",
  more: "more-categories.svg",
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
  className = "w-6 h-6",
  handle,
  title,
  iconKey,
  active = false,
}: CategoryIconProps) {
  const resolvedKey = iconKey ?? resolveCategoryIconKey(handle, title);

  if (resolvedKey === "default") {
    return (
      <DefaultCategoryIcon
        className={`shrink-0 transition-all ${active ? "text-header-accent opacity-100 scale-105" : "text-header-muted opacity-80 group-hover:text-header-accent group-hover:opacity-100"} ${className}`}
      />
    );
  }

  const filename = CATEGORY_SVG_FILES[resolvedKey];
  const src = `/icons/categories/${filename}`;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain transition-all ${active ? "opacity-100 scale-105" : "opacity-80 group-hover:opacity-100 group-hover:scale-105"} ${className}`}
    />
  );
}
