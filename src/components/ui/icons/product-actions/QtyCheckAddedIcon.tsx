type ProductActionIconProps = {
  className?: string;
};

const outlineProps = {
  fill: "none" as const,
  stroke: "#1F2A33",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const whiteStrokeProps = {
  fill: "none" as const,
  stroke: "#fff",
  strokeWidth: 2.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function QtyCheckAddedIcon({ className = "h-9 w-9 shrink-0" }: ProductActionIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="32" cy="32" r="24" fill="#66C940" />
      <circle cx="32" cy="32" r="24" {...outlineProps} />
      <path d="M22 33l7 7l13-15" {...whiteStrokeProps} />
    </svg>
  );
}
