"use client";

import { useState, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { useSetWishlistWithNotification } from "@/hooks/useWishlistMutations";
import styles from "./WishlistHeartButton.module.css";

type Props = {
  productId: string | number;
  name: string;
  saved: boolean;
  size: number;
  className: string;
};

export function WishlistHeartButton({ productId, name, saved, size, className }: Props) {
  const { setWishlist, isLoading } = useSetWishlistWithNotification();
  const [celebrate, setCelebrate] = useState(false);

  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextSaved = !saved;
    setCelebrate(false);
    const confirmed = await setWishlist(productId, nextSaved);
    if (confirmed && nextSaved &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCelebrate(true);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={isLoading} className={className}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`} aria-pressed={saved}>
      <span aria-hidden="true" className={styles.icon} data-celebrate={saved && celebrate}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget.firstElementChild) setCelebrate(false);
        }}>
        <Heart size={size} fill={saved ? "currentColor" : "none"} />
        {saved && celebrate && <>
          <Heart size={8} className={styles.first} fill="currentColor" />
          <Heart size={6} className={styles.second} fill="currentColor" />
        </>}
      </span>
    </button>
  );
}
