"use client";

import { useState, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { useAddToWishlistWithNotification } from "@/hooks/useWishlistMutations";
import styles from "./WishlistHeartButton.module.css";

type Props = {
  productId: string | number;
  name: string;
  saved: boolean;
  size: number;
  className: string;
};

export function WishlistHeartButton({ productId, name, saved, size, className }: Props) {
  const { addToWishlist, isLoading } = useAddToWishlistWithNotification(name);
  const [celebrate, setCelebrate] = useState(false);

  async function save(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const result = await addToWishlist(productId);
    if (!saved && result?.wishlist?.includes(String(productId)) &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCelebrate(true);
    }
  }

  return (
    <button type="button" onClick={save} disabled={isLoading} className={className}
      aria-label={saved ? `${name} is in your wishlist` : `Add ${name} to wishlist`} aria-pressed={saved}>
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
