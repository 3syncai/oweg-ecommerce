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

export default function SignOutMenuIcon({ className }: AccountMenuIconProps) {
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
      <path d="M24 12h19c3 0 5 2 5 5v30c0 3-2 5-5 5H24" {...outlineProps} />
      <path d="M16 32h22" {...outlineProps} />
      <path
        d="M31 23l9 9l-9 9"
        fill="none"
        stroke="#66C940"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 20v24" {...outlineProps} />
      <rect x="12" y="18" width="8" height="28" rx="2" fill="#EAF8E7" />
      <rect x="12" y="18" width="8" height="28" rx="2" {...outlineProps} />
    </svg>
  );
}
