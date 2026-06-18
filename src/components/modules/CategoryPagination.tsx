"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type CategoryPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function buildPageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: Array<number | "ellipsis"> = [1];

  if (current > 3) {
    items.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (current < total - 2) {
    items.push("ellipsis");
  }

  if (total > 1) {
    items.push(total);
  }

  return items;
}

export function CategoryPagination({
  currentPage,
  totalPages,
  onPageChange,
}: CategoryPaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(currentPage, totalPages);

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-2 py-8 border-t border-gray-200 mt-6"
      aria-label="Results pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>

      <div className="flex items-center gap-1">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-500 text-sm">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`min-w-[2.25rem] rounded-lg px-3 py-2 text-sm transition-colors ${
                item === currentPage
                  ? "bg-[#7AC943] text-white font-semibold"
                  : "text-gray-700 hover:text-[#7AC943]"
              }`}
              aria-current={item === currentPage ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
