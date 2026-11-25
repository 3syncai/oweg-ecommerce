"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useTransition, type ComponentProps, type ReactNode } from "react";
import styles from "./CategoryNavigation.module.css";

type NavigationOptions = { replace?: boolean; scroll?: boolean };
const CategoryNavigation = createContext<((href: string, options: NavigationOptions) => boolean) | null>(null);

export function CategoryNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const target = useRef<string | null>(null);

  useEffect(() => {
    if (!pending) target.current = null;
  }, [pending]);

  const navigate = useCallback((href: string, { replace, scroll }: NavigationOptions) => {
    const { pathname, search, hash } = window.location;
    if (href === pathname + search + hash) return false;
    if (target.current === href) return true;
    target.current = href;
    startTransition(() => {
      if (replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    });
    return true;
  }, [router]);

  return (
    <CategoryNavigation.Provider value={navigate}>
      {children}
      {pending && (
        <div className={styles.progress} role="status" aria-label="Opening category">
          <span aria-hidden="true" />
        </div>
      )}
    </CategoryNavigation.Provider>
  );
}

type CategoryLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string };

export function CategoryLink({ href, replace, scroll, className, ...props }: CategoryLinkProps) {
  const navigate = useContext(CategoryNavigation);
  const isCategory = href.startsWith("/c/");
  return <Link {...props} href={href} replace={replace} scroll={scroll}
    className={isCategory ? [className, styles.link].filter(Boolean).join(" ") : className}
    onNavigate={event => {
      if (isCategory && navigate?.(href, { replace, scroll })) event.preventDefault();
    }} />;
}
