import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Coffee,
  Cpu,
  Droplets,
  Fan,
  Flame,
  Gamepad2,
  HardDrive,
  Headphones,
  Heater,
  Keyboard,
  Lamp,
  Lock,
  Microwave,
  Monitor,
  Package,
  Plug,
  Refrigerator,
  Shield,
  Shirt,
  Smartphone,
  Speaker,
  SprayCan,
  Utensils,
  WashingMachine,
  Wifi,
  Wind,
  Wrench,
} from "lucide-react";

const RULES: Array<{ includes: string[]; icon: LucideIcon }> = [
  { includes: ["kettle"], icon: Coffee },
  { includes: ["geyser"], icon: Droplets },
  { includes: ["water", "heater"], icon: Droplets },
  { includes: ["immersion"], icon: Plug },
  { includes: ["iron"], icon: Shirt },
  { includes: ["fan"], icon: Fan },
  { includes: ["cooler"], icon: Wind },
  { includes: ["heater"], icon: Heater },
  { includes: ["room", "heater"], icon: Heater },
  { includes: ["chopper"], icon: Utensils },
  { includes: ["mixer"], icon: Utensils },
  { includes: ["grinder"], icon: Utensils },
  { includes: ["microwave"], icon: Microwave },
  { includes: ["fridge"], icon: Refrigerator },
  { includes: ["refrigerat"], icon: Refrigerator },
  { includes: ["wash"], icon: WashingMachine },
  { includes: ["camera"], icon: Camera },
  { includes: ["cctv"], icon: Camera },
  { includes: ["surveillance"], icon: Camera },
  { includes: ["security"], icon: Shield },
  { includes: ["lock"], icon: Lock },
  { includes: ["keyboard"], icon: Keyboard },
  { includes: ["mouse"], icon: Cpu },
  { includes: ["headphone"], icon: Headphones },
  { includes: ["earbud"], icon: Headphones },
  { includes: ["speaker"], icon: Speaker },
  { includes: ["wifi"], icon: Wifi },
  { includes: ["adapter"], icon: Wifi },
  { includes: ["usb"], icon: HardDrive },
  { includes: ["cooling"], icon: Wind },
  { includes: ["pad"], icon: Monitor },
  { includes: ["mobile"], icon: Smartphone },
  { includes: ["phone"], icon: Smartphone },
  { includes: ["computer"], icon: Monitor },
  { includes: ["laptop"], icon: Monitor },
  { includes: ["hardware"], icon: Wrench },
  { includes: ["tool"], icon: Wrench },
  { includes: ["lamp"], icon: Lamp },
  { includes: ["light"], icon: Lamp },
  { includes: ["beauty"], icon: SprayCan },
  { includes: ["game"], icon: Gamepad2 },
  { includes: ["stove"], icon: Flame },
  { includes: ["gas"], icon: Flame },
];

function normalizeKey(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map subcategory title/handle to a lucide SVG icon for the mobile category panel. */
export function getSubcategoryIcon(
  title?: string | null,
  handle?: string | null,
): LucideIcon {
  const key = `${normalizeKey(title)} ${normalizeKey(handle)}`;
  const tokens = key.split("-").filter(Boolean);

  for (const rule of RULES) {
    if (rule.includes.every((kw) => tokens.some((t) => t.includes(kw)))) {
      return rule.icon;
    }
  }

  // Single-token fallbacks
  for (const rule of RULES) {
    if (rule.includes.some((kw) => tokens.some((t) => t.includes(kw)))) {
      return rule.icon;
    }
  }

  return Package;
}
