"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 25;

/** Clamps `page` to the valid range and returns the slice to display. */
export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), current, totalPages, start };
}

export default function Pagination({
  total,
  page,
  pageSize = PAGE_SIZE,
  onPageChange,
}: {
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;

  const { current, totalPages, start } = paginate(new Array(total), page, pageSize);
  const end = Math.min(start + pageSize, total);

  const buttonClass =
    "flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/80 px-5 py-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        Showing {start + 1}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          className={buttonClass}
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {current} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(current + 1)}
          disabled={current >= totalPages}
          className={buttonClass}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
