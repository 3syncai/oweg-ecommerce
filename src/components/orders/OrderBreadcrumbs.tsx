"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = {
  label: string;
  href?: string;
};

type OrderBreadcrumbsProps = {
  items: Crumb[];
};

export default function OrderBreadcrumbs({ items }: OrderBreadcrumbsProps) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
      <Link href="/" className="font-medium text-slate-500 transition hover:text-[#326b29]">
        Home
      </Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          {item.href ? (
            <Link href={item.href} className="font-medium text-slate-500 transition hover:text-[#326b29]">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-slate-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
