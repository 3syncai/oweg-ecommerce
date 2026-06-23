type AccountMenuIconProps = {
  className?: string;
};

const outlineProps = {
  fill: "none" as const,
  stroke: "#1F2A33",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function MyAccountMenuIcon({ className }: AccountMenuIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="32" cy="22" r="9" {...outlineProps} />
      <path fill="#66C940" d="M28 18c0-2 2-4 4-4s4 2 4 4v3h-8z" />
      <path d="M16 50c1-9 8-15 16-15s15 6 16 15" {...outlineProps} />
      <rect x="43" y="14" width="10" height="10" rx="2" fill="#EAF8E7" />
      <rect x="43" y="14" width="10" height="10" rx="2" {...outlineProps} />
      <path d="M46 19h4" fill="none" stroke="#66C940" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
