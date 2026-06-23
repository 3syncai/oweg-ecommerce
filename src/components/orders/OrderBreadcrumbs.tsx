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
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:text-sm" aria-label="Breadcrumb">
      <Link href="/" className="font-medium text-[#66C940] hover:underline">
        Home
      </Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          {item.href ? (
            <Link href={item.href} className="font-medium text-[#66C940] hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-[#1F2A33]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
