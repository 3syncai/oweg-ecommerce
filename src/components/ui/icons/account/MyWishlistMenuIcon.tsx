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

export default function MyWishlistMenuIcon({ className }: AccountMenuIconProps) {
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
      <path
        d="M32 51l-3-2C18 41 11 35 11 25c0-7 5-12 12-12c4 0 7 2 9 5c2-3 5-5 9-5c7 0 12 5 12 12c0 10-7 16-18 24l-3 2z"
        {...outlineProps}
      />
      <path
        fill="#66C940"
        d="M32 46l-2-1.4C21 38 16 33 16 25.8c0-4.6 3-7.8 7.2-7.8c2.7 0 5 1.4 6.5 3.8c.8 1.2 2.6 1.2 3.4 0c1.5-2.4 3.8-3.8 6.5-3.8c4.2 0 7.2 3.2 7.2 7.8c0 7.2-5 12.2-14 18.8z"
      />
      <path
        d="M24 27c1-3 3-5 6-5"
        fill="none"
        stroke="#66C940"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
