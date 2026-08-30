"use client";

import React from "react";
import CategoryIcon from "@/components/ui/icons/CategoryIcon";
import SubcategoryIcon from "@/components/ui/icons/SubcategoryIcon";

export type IconTileSize = "sm" | "md" | "lg";

const TILE_BOX: Record<IconTileSize, string> = {
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-16 h-16 sm:w-[72px] sm:h-[72px]",
};

const TILE_GLYPH: Record<IconTileSize, string> = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-9 h-9 sm:w-10 sm:h-10",
};

const LABEL_TEXT: Record<IconTileSize, string> = {
  sm: "text-[11px] leading-tight",
  md: "text-xs leading-tight",
  lg: "text-[12px] sm:text-[13px] leading-snug",
};

type CategoryIconTileProps = {
  handle?: string;
  title?: string;
  /** Which icon set to resolve the glyph from. */
  kind?: "category" | "subcategory";
  size?: IconTileSize;
  active?: boolean;
  /** Render the title under the tile. */
  showLabel?: boolean;
  /** Lay the tile and label side by side instead of stacked. */
  orientation?: "vertical" | "horizontal";
  /** Optional label override, defaults to `title`. */
  label?: string;
  /** Allow a horizontal label to wrap onto two lines instead of truncating. */
  labelWrap?: boolean;
  className?: string;
  labelClassName?: string;
};

/**
 * Presentational tile that frames a category/subcategory SVG on a soft surface
 * so the header, mega menu and mobile sheet all read as one system.
 */
export default function CategoryIconTile({
  handle,
  title,
  kind = "category",
  size = "md",
  active = false,
  showLabel = true,
  orientation = "vertical",
  label,
  labelWrap = false,
  className = "",
  labelClassName = "",
}: CategoryIconTileProps) {
  const glyphClass = TILE_GLYPH[size];
  const text = label ?? title ?? "";

  const glyph =
    kind === "subcategory" ? (
      <SubcategoryIcon handle={handle} title={title} className={glyphClass} />
    ) : (
      <CategoryIcon handle={handle} title={title} className={glyphClass} active={active} />
    );

  const isHorizontal = orientation === "horizontal";

  return (
    <span
      className={[
        "flex min-w-0",
        isHorizontal ? "flex-row items-center gap-2.5" : "flex-col items-center gap-2 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={`oweg-icon-tile shrink-0 ${TILE_BOX[size]}`}
        data-active={active ? "true" : "false"}
      >
        {glyph}
      </span>
      {showLabel && text ? (
        <span
          className={[
            "min-w-0 font-medium text-[var(--oweg-ink-soft)] transition-colors group-hover:text-[var(--oweg-green-dark)]",
            LABEL_TEXT[size],
            isHorizontal && !labelWrap ? "truncate" : "line-clamp-2",
            active ? "text-[var(--oweg-green-dark)]" : "",
            labelClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
