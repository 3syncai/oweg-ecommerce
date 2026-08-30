import type { ReactNode } from "react";

type PolicyPageShellProps = {
  badge: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function PolicyPageShell({ badge, title, description, children }: PolicyPageShellProps) {
  return (
    <div className="oweg-page min-h-screen text-[var(--oweg-ink)]">
      <div className="oweg-container max-w-4xl space-y-8 py-10 md:space-y-10 md:py-16">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-4 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
            {badge}
          </div>
          <h1 className="oweg-title text-[clamp(1.6rem,1.1rem+2.4vw,2.5rem)]">{title}</h1>
          {description ? <p className="oweg-subtle max-w-2xl">{description}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
