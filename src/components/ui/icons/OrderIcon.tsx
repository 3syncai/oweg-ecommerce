// OrderIcon: Shopping bag with checkmark icon for orders section in header
export default function OrderIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Shopping bag outline */}
      <path
        d="M4 4L4.5 15.5C4.5 16.3284 5.17157 17 6 17H14C14.8284 17 15.5 16.3284 15.5 15.5L16 4H4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bag handle */}
      <path
        d="M6 4V2C6 1.44772 6.44772 1 7 1H13C13.5523 1 14 1.44772 14 2V4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Checkmark inside bag */}
      <path
        d="M7.5 10L9.5 12L12.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

