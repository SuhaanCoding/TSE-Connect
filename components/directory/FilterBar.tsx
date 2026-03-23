"use client";

import { useState, useRef, useEffect } from "react";
import type { AlumniFilters } from "@/lib/types";

interface FilterBarProps {
  filters: AlumniFilters;
  onFilterChange: (filters: Partial<AlumniFilters>) => void;
  years: string[];
  companies: string[];
}

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "opted_in", label: "Opted In" },
  { value: "not_confirmed", label: "Not Confirmed" },
  { value: "opted_out", label: "Opted Out" },
];

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (item: string) => {
    onChange(
      selected.includes(item)
        ? selected.filter((s) => s !== item)
        : [...selected, item]
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg bg-surface border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent flex items-center gap-2 cursor-pointer"
        type="button"
      >
        {selected.length > 0 ? `${label} (${selected.length})` : label}
        <svg className="h-3 w-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg bg-surface border border-border shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded bg-background border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-text-muted px-2 py-1">No results</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item}
                  onClick={() => toggle(item)}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[rgba(250,250,248,0.05)] flex items-center gap-2 cursor-pointer"
                  type="button"
                >
                  <span
                    className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                      selected.includes(item)
                        ? "bg-accent border-accent"
                        : "border-border"
                    }`}
                  >
                    {selected.includes(item) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-foreground truncate">{item}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent-light text-[11px] px-2 py-0.5"
            >
              {item}
              <button
                onClick={() => toggle(item)}
                className="hover:text-foreground cursor-pointer"
                type="button"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({
  filters,
  onFilterChange,
  years,
  companies,
}: FilterBarProps) {
  const hasFilters =
    filters.graduation_years.length > 0 ||
    filters.companies.length > 0 ||
    filters.opt_status;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <MultiSelectDropdown
          label="Year"
          options={years}
          selected={filters.graduation_years}
          onChange={(selected) => onFilterChange({ graduation_years: selected })}
        />

        <MultiSelectDropdown
          label="Company"
          options={companies}
          selected={filters.companies}
          onChange={(selected) => onFilterChange({ companies: selected })}
        />

        {/* Current/Past employee filter — always visible */}
        <select
          value={filters.company_match}
          onChange={(e) =>
            onFilterChange({ company_match: e.target.value as "all" | "current" | "past" })
          }
          className="rounded-lg bg-surface border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        >
          <option value="all">Current & Past</option>
          <option value="current">Currently Working</option>
          <option value="past">Previously Worked</option>
        </select>

        <select
          value={filters.opt_status || ""}
          onChange={(e) =>
            onFilterChange({ opt_status: e.target.value || null })
          }
          className="rounded-lg bg-surface border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() =>
              onFilterChange({
                graduation_years: [],
                companies: [],
                company_match: "all" as const,
                opt_status: null,
              })
            }
            className="text-xs text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
