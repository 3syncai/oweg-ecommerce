"use client";

import React from "react";
import { normalizeCategorySlug } from "@/components/ui/icons/CategoryIcon";

const SUBCATEGORY_ICON_FILES = new Set([
  "kettle",
  "water-heaters-and-geysers",
  "iron",
  "ceiling-fans",
  "hose-pipes",
  "choppers",
  "toasters-and-grillers",
  "table-fans",
  "immersion-rod",
  "led-lamps-and-torches",
  "bottles-and-flasks",
  "mop",
  "lunch-box",
  "keyboards",
  "mouse",
  "speakers",
  "power-banks",
  "e-cameras",
  "wireless-usb-adapters",
  "cooling-pad",
  "jackets",
  "jeans",
  "gas-stoves-and-hobs",
  "mixer-grinders-and-juicer",
  "inductions-and-cooktops",
  "pressure-cooker",
  "knife-sets",
  "tawa",
  "fry-pan",
  "kadai",
  "electric-cookers",
  "jars-and-containers",
  "electric-ovens",
  "cameras",
  "video-door-phone",
  "power-supply",
  "cables",
  "em-locks",
  "biometric-devices",
  "sassiest-health-care",
  "castor-wheels",
]);

const SLUG_ALIASES: Record<string, string> = {
  "water-heaters-geysers": "water-heaters-and-geysers",
  "water-heater": "water-heaters-and-geysers",
  "geysers": "water-heaters-and-geysers",
  "ceiling-fan": "ceiling-fans",
  "table-fan": "table-fans",
  "toaster": "toasters-and-grillers",
  "toasters": "toasters-and-grillers",
  "grillers": "toasters-and-grillers",
  "led-lamps-torches": "led-lamps-and-torches",
  "led-lamp": "led-lamps-and-torches",
  "bottles-flasks": "bottles-and-flasks",
  "lunchbox": "lunch-box",
  "lunch-boxes": "lunch-box",
  "mixer-grinder": "mixer-grinders-and-juicer",
  "mixer-grinders": "mixer-grinders-and-juicer",
  "mixer-grinders-juicer": "mixer-grinders-and-juicer",
  "mixer": "mixer-grinders-and-juicer",
  "gas-stove": "gas-stoves-and-hobs",
  "gas-stoves": "gas-stoves-and-hobs",
  "induction": "inductions-and-cooktops",
  "induction-cooktop": "inductions-and-cooktops",
  "inductions": "inductions-and-cooktops",
  "pressure-cookers": "pressure-cooker",
  "knife-set": "knife-sets",
  "fry-pans": "fry-pan",
  "electric-cooker": "electric-cookers",
  "jars-containers": "jars-and-containers",
  "electric-oven": "electric-ovens",
  "power-bank": "power-banks",
  "e-camera": "e-cameras",
  "wireless-usb-adapter": "wireless-usb-adapters",
  "cooling-pads": "cooling-pad",
  "jacket": "jackets",
  "jean": "jeans",
  "keyboard": "keyboards",
  "mice": "mouse",
  "speaker": "speakers",
  "hose-pipe": "hose-pipes",
  "chopper": "choppers",
  "immersion-rods": "immersion-rod",
  "kadhai": "kadai",
  "surveillance-security-cameras": "cameras",
  camera: "cameras",
  "surveillance-security-video-door-phone": "video-door-phone",
  "video-door-phones": "video-door-phone",
  "video-door": "video-door-phone",
  "surveillance-security-power-supply": "power-supply",
  "power-supplies": "power-supply",
  "surveillance-security-cables": "cables",
  cable: "cables",
  "surveillance-security-em-locks": "em-locks",
  "em-lock": "em-locks",
  "surveillance-security-biometric-devices": "biometric-devices",
  biometric: "biometric-devices",
  "biometric-device": "biometric-devices",
  "health-care-sassiest": "sassiest-health-care",
  sassiest: "sassiest-health-care",
  "castor-wheel": "castor-wheels",
  "caster-wheels": "castor-wheels",
  "caster-wheel": "castor-wheels",
};

export function resolveSubcategoryIconSlug(handle?: string, title?: string): string | null {
  const candidates = [handle, title].map((v) => normalizeCategorySlug(v)).filter(Boolean);

  for (const slug of candidates) {
    if (SUBCATEGORY_ICON_FILES.has(slug)) {
      return slug;
    }
    const alias = SLUG_ALIASES[slug];
    if (alias && SUBCATEGORY_ICON_FILES.has(alias)) {
      return alias;
    }
  }

  return null;
}

type SubcategoryIconProps = {
  handle?: string;
  title?: string;
  className?: string;
};

const strokeProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function DefaultSubcategoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="5" width="6" height="6" rx="1.5" {...strokeProps} />
      <rect x="13" y="5" width="6" height="6" rx="1.5" {...strokeProps} />
      <rect x="5" y="13" width="6" height="6" rx="1.5" {...strokeProps} />
      <rect x="13" y="13" width="6" height="6" rx="1.5" {...strokeProps} />
    </svg>
  );
}

export default function SubcategoryIcon({
  handle,
  title,
  className = "w-6 h-6",
}: SubcategoryIconProps) {
  const slug = resolveSubcategoryIconSlug(handle, title);

  if (!slug) {
    return (
      <DefaultSubcategoryIcon
        className={`shrink-0 text-[#1F2A33] group-hover:text-[#66C940] transition-colors ${className}`}
      />
    );
  }

  return (
    <img
      src={`/icons/subcategories/${slug}.svg`}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain transition-opacity group-hover:opacity-100 ${className}`}
    />
  );
}
