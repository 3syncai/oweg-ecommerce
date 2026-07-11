"use client";

import Image from "next/image";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

type BrandLogoImageProps = {
  src: string;
  alt: string;
  scale?: number;
  /** Base box width at scale 1. Ignored when fillParent is true. */
  maxWidth?: number;
  /** Base box height at scale 1. Ignored when fillParent is true. */
  maxHeight?: number;
  /** Max width cap in px (prevents clipping inside parent). */
  parentMaxWidth?: number;
  /** Max height cap in px (prevents clipping inside parent). */
  parentMaxHeight?: number;
  /** Fill the parent container (parent must have position + size). */
  fillParent?: boolean;
  className?: string;
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
};

export function clampBrandLogoScale(scale?: number): number {
  const parsed = typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed));
}

function computeBoxDimensions(
  baseWidth: number,
  baseHeight: number,
  scale: number,
  capWidth?: number,
  capHeight?: number
) {
  let width = Math.round(baseWidth * scale);
  let height = Math.round(baseHeight * scale);

  if (capWidth !== undefined) {
    width = Math.min(width, capWidth);
  }
  if (capHeight !== undefined) {
    height = Math.min(height, capHeight);
  }

  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function BrandLogoImage({
  src,
  alt,
  scale = 1,
  maxHeight = 64,
  maxWidth = 136,
  parentMaxWidth,
  parentMaxHeight,
  fillParent = false,
  className = "",
  onError,
}: BrandLogoImageProps) {
  const safeScale = clampBrandLogoScale(scale);

  if (fillParent) {
    const pct = Math.min(safeScale * 100, 100);

    return (
      <div
        className={`flex h-full w-full items-center justify-center min-h-0 min-w-0 ${className}`}
      >
        <div
          className="relative min-h-0 min-w-0"
          style={{ width: `${pct}%`, height: `${pct}%` }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="160px"
            className="object-contain object-center"
            onError={onError}
          />
        </div>
      </div>
    );
  }

  const { width, height } = computeBoxDimensions(
    maxWidth,
    maxHeight,
    safeScale,
    parentMaxWidth,
    parentMaxHeight
  );

  return (
    <div
      className={`relative shrink-0 min-w-0 ${className}`}
      style={{ width, height }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={`${width}px`}
        className="object-contain object-center"
        onError={onError}
      />
    </div>
  );
}

export function brandLogoFallbackHandler(
  event: React.SyntheticEvent<HTMLImageElement, Event>
) {
  const img = event.currentTarget;
  if (img.src.includes("oweg_logo")) return;
  img.src = "/oweg_logo.png";
}
