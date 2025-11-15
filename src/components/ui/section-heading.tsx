// SectionHeading: Displays a dual-line heading with brand colors

import clsx from "clsx"

type SectionHeadingProps = {
  title: string
  className?: string
  accentColor?: string
  lineColor?: string
  showTopRule?: boolean
}

export function SectionHeading({
  title,
  className,
  accentColor = "#1F7A1F",
  lineColor = "#7AC943",
  showTopRule = false,
}: SectionHeadingProps) {
  return (
    <div className={clsx("w-full", className)}>
      {showTopRule && (
        <div
          className="h-1 w-full rounded-full"
          style={{ backgroundColor: lineColor }}
        />
      )}
      <div className="mt-1 flex items-center gap-3">
        <h2
          className="text-lg font-semibold leading-tight"
          style={{ color: accentColor }}
        >
          {title}
        </h2>
        <div
          className="flex-1"
          style={{ height: "2px", backgroundColor: lineColor }}
        />
      </div>
    </div>
  )
}

