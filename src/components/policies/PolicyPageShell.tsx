import type { ReactNode } from "react";

type PolicyPageShellProps = {
  badge: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function PolicyPageShell({ badge, title, description, children }: PolicyPageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            {badge}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">{title}</h1>
          {description ? <p className="text-gray-600">{description}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
