type ProductActionIconProps = {
  className?: string;
};

const whiteStrokeProps = {
  fill: "none" as const,
  stroke: "#fff",
  strokeWidth: 2.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function QtyPlusIcon({ className }: ProductActionIconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="32" cy="32" r="24" fill="#66C940" />
      <path d="M32 21v22M21 32h22" {...whiteStrokeProps} />
    </svg>
  );
}
