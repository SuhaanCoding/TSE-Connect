"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";
import FilterBar from "./FilterBar";
import AlumniGrid from "./AlumniGrid";
import Link from "next/link";
import NetworkExplorer from "./NetworkExplorer";
import type { Alumni, AlumniFilters } from "@/lib/types";

const PAGE_LIMIT = 24;

function parseFiltersFromParams(params: URLSearchParams): {
  filters: AlumniFilters;
  searchInput: string;
  page: number;
} {
  return {
    searchInput: params.get("q") || "",
    filters: {
      query: params.get("q") || "",
      graduation_years: params.get("years")?.split(",").filter(Boolean) || [],
      companies: params.get("companies")?.split(",").filter(Boolean) || [],
      company_match:
        (params.get("company_match") as "all" | "current" | "past") || "all",
      opt_statuses:
        params.get("opt_statuses")?.split(",").filter(Boolean) || [],
    },
    page: Math.max(1, parseInt(params.get("page") || "1", 10) || 1),
  };
}

function buildSearchParams(
  filters: AlumniFilters,
  searchInput: string,
  page: number,
): string {
  const params = new URLSearchParams();
  if (searchInput) params.set("q", searchInput);
  if (filters.graduation_years.length)
    params.set("years", filters.graduation_years.join(","));
  if (filters.companies.length)
    params.set("companies", filters.companies.join(","));
  if (filters.company_match !== "all")
    params.set("company_match", filters.company_match);
  if (filters.opt_statuses.length)
    params.set("opt_statuses", filters.opt_statuses.join(","));
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

interface DirectoryViewProps {
  initialAlumni: Alumni[];
  initialCount: number;
  years: string[];
  companies: string[];
  viewerOptedIn: boolean;
}

function BrowseDirectory({
  initialAlumni,
  initialCount,
  years,
  companies,
  viewerOptedIn,
}: DirectoryViewProps) {
  const searchParams = useSearchParams();
  const initialParsed = parseFiltersFromParams(searchParams);

  const [alumni, setAlumni] = useState<Alumni[]>(initialAlumni);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const [page, setPage] = useState(initialParsed.page);
  const [searchInput, setSearchInput] = useState(initialParsed.searchInput);
  const [matchTerms, setMatchTerms] = useState<string[]>([]);
  const [filters, setFilters] = useState<AlumniFilters>(initialParsed.filters);
  const initialData = useRef({ alumni: initialAlumni, count: initialCount });
  useEffect(() => {
    initialData.current = { alumni: initialAlumni, count: initialCount };
  }, [initialAlumni, initialCount]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseFiltersFromParams(
        new URLSearchParams(window.location.search),
      );
      setSearchInput(parsed.searchInput);
      setFilters(parsed.filters);
      setPage(parsed.page);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (isComposing) return;
    const controller = new AbortController();
    const query = searchInput.trim();
    const qs = buildSearchParams(filters, query, page);
    const isDefault = !qs;
    const timer = setTimeout(
      async () => {
        const url = `/directory?view=browse${qs ? `&${qs}` : ""}`;
        if (window.location.pathname + window.location.search !== url) {
          window.history.pushState(null, "", url);
        }
        setError(null);
        if (isDefault) {
          setAlumni(initialData.current.alumni);
          setTotalCount(initialData.current.count);
          setMatchTerms([]);
          setLoading(false);
        }
        if (!isDefault) setLoading(true);
        try {
          const params = new URLSearchParams(qs);
          params.set("limit", String(PAGE_LIMIT));
          const res = await fetch(`/api/alumni?${params}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Search failed");
          const json = await res.json();
          if (controller.signal.aborted) return;
          setAlumni(json.data || []);
          setTotalCount(json.count || 0);
          setMatchTerms(json.matchTerms || []);
        } catch {
          if (!controller.signal.aborted)
            setError("Couldn’t load alumni. Please try again.");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchInput, filters, page, isComposing, retry]);

  const handlePageChange = useCallback(
    (newPage: number) => setPage(newPage),
    [],
  );
  const handleFilterChange = (partial: Partial<AlumniFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
    setPage(1);
  };

  const totalPages = Math.ceil(totalCount / PAGE_LIMIT);

  return (
    <div className="space-y-6">
      <SearchBar
        value={searchInput}
        onChange={(value) => {
          setSearchInput(value);
          setPage(1);
        }}
        onCompositionChange={setIsComposing}
      />
      <FilterBar
        filters={{ ...filters, query: searchInput }}
        onFilterChange={handleFilterChange}
        years={years}
        companies={companies}
      />
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-red-400"
        >
          <p>{error}</p>
          <button
            onClick={() => setRetry((value) => value + 1)}
            className="cursor-pointer rounded text-foreground underline hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Try again
          </button>
        </div>
      )}
      <div aria-busy={loading}>
        <AlumniGrid
          alumni={alumni}
          totalCount={totalCount}
          loading={loading}
          viewerOptedIn={viewerOptedIn}
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          companyFilter={matchTerms}
        />
      </div>
    </div>
  );
}

export default function DirectoryView(props: DirectoryViewProps) {
  const params = useSearchParams();
  const browse =
    params.get("view") === "browse" ||
    (!params.get("view") &&
      ["q", "years", "companies", "company_match", "opt_statuses", "page"].some(
        (key) => params.has(key),
      ));
  return (
    <div className="space-y-6">
      <nav
        aria-label="Directory views"
        className="flex gap-6 border-b border-border"
      >
        <Link
          href="/directory?view=ranked"
          aria-current={!browse ? "page" : undefined}
          className={`pb-3 text-sm font-medium border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${!browse ? "border-accent text-foreground" : "border-transparent text-text-muted hover:text-foreground"}`}
        >
          Ranked discovery
        </Link>
        <Link
          href="/directory?view=browse"
          aria-current={browse ? "page" : undefined}
          className={`pb-3 text-sm font-medium border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${browse ? "border-accent text-foreground" : "border-transparent text-text-muted hover:text-foreground"}`}
        >
          Browse directory
        </Link>
      </nav>
      {browse ? (
        <BrowseDirectory {...props} />
      ) : (
        <NetworkExplorer years={props.years} companies={props.companies} />
      )}
    </div>
  );
}
