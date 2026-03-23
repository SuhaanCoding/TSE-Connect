"use client";

import AlumniCard from "./AlumniCard";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { Alumni } from "@/lib/types";

interface AlumniGridProps {
  alumni: Alumni[];
  totalCount: number;
  loading: boolean;
  viewerOptedIn: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  companyFilter?: string[];
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push("...");
  }

  // Show neighbors around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

export default function AlumniGrid({
  alumni,
  totalCount,
  loading,
  viewerOptedIn,
  page,
  totalPages,
  onPageChange,
  companyFilter = [],
}: AlumniGridProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface border border-border p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (alumni.length === 0) {
    return (
      <div className="text-center py-20">
        <svg
          className="mx-auto h-12 w-12 text-text-muted mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
        <p className="text-text-muted">
          No alumni match your search. Try broadening your filters.
        </p>
      </div>
    );
  }

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Showing {alumni.length} of {totalCount} alumni
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {alumni.map((person, i) => (
          <AlumniCard
            key={person.id}
            alumni={person}
            index={i}
            viewerOptedIn={viewerOptedIn}
            companyFilter={companyFilter}
          />
        ))}
      </div>

      {/* Numbered pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-4">
          {/* Previous arrow */}
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-sm text-text-secondary hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Page numbers */}
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="h-9 w-9 flex items-center justify-center text-sm text-text-muted"
              >
                ...
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors cursor-pointer",
                  p === page
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:bg-surface hover:text-foreground"
                )}
              >
                {p}
              </button>
            )
          )}

          {/* Next arrow */}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-sm text-text-secondary hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
