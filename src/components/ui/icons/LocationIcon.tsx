// LocationIcon: SVG icon for delivery location in header
export default function LocationIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.1792 7.79347C3.19 4.61303 5.77702 2.04354 8.95746 2.05431C12.1379 2.06515 14.7074 4.65216 14.6966 7.8326V7.89782C14.6575 9.96521 13.5031 11.8761 12.0879 13.3696C11.2785 14.21 10.3747 14.9541 9.39442 15.587C9.1323 15.8137 8.74349 15.8137 8.48137 15.587C7.02 14.6358 5.7374 13.4348 4.69224 12.0391C3.76071 10.822 3.23182 9.3448 3.1792 7.81304V7.79347Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.93755 9.75C9.95693 9.75 10.7833 8.92363 10.7833 7.90425C10.7833 6.88487 9.95693 6.0585 8.93755 6.0585C7.91817 6.0585 7.0918 6.88487 7.0918 7.90425C7.0918 8.92363 7.91817 9.75 8.93755 9.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

