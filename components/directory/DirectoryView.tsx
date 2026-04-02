"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";
import FilterBar from "./FilterBar";
import AlumniGrid from "./AlumniGrid";
import { debounce } from "@/lib/utils";
import type { Alumni, AlumniFilters } from "@/lib/types";

const PAGE_LIMIT = 24;

// Module-level cache survives client-side navigations (component unmount/remount)
let directoryCache: {
  key: string;
  alumni: Alumni[];
  totalCount: number;
  matchTerms: string[];
} | null = null;

function cacheKey(filters: AlumniFilters, searchInput: string, page: number): string {
  return JSON.stringify({ filters, searchInput, page });
}

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
    page: parseInt(params.get("page") || "1", 10),
  };
}

function buildSearchParams(
  filters: AlumniFilters,
  searchInput: string,
  page: number
): string {
  const params = new URLSearchParams();
  if (searchInput) params.set("q", searchInput);
  if (filters.graduation_years.length)
    params.set("years", filters.graduation_years.join(","));
  if (filters.companies.length) {
    params.set("companies", filters.companies.join(","));
    params.set("company_match", filters.company_match);
  }
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

export default function DirectoryView({
  initialAlumni,
  initialCount,
  years,
  companies,
  viewerOptedIn,
}: DirectoryViewProps) {
  const searchParams = useSearchParams();
  const initialParsed = parseFiltersFromParams(searchParams);

  const hasInitialFilters =
    !!initialParsed.searchInput ||
    initialParsed.filters.graduation_years.length > 0 ||
    initialParsed.filters.companies.length > 0 ||
    initialParsed.filters.opt_statuses.length > 0;

  // Check if we have cached results for these exact filters
  const cachedKey = cacheKey(initialParsed.filters, initialParsed.searchInput, initialParsed.page);
  const cached = directoryCache?.key === cachedKey ? directoryCache : null;

  const [alumni, setAlumni] = useState<Alumni[]>(
    cached ? cached.alumni : hasInitialFilters ? [] : initialAlumni
  );
  const [totalCount, setTotalCount] = useState(
    cached ? cached.totalCount : hasInitialFilters ? 0 : initialCount
  );
  const [loading, setLoading] = useState(hasInitialFilters && !cached);
  const [page, setPage] = useState(initialParsed.page);
  const [searchInput, setSearchInput] = useState(initialParsed.searchInput);
  const [matchTerms, setMatchTerms] = useState<string[]>(cached?.matchTerms || []);
  const [filters, setFilters] = useState<AlumniFilters>(
    initialParsed.filters
  );
  const initialFetchDone = useRef(!!cached);
  const isFirstRun = useRef(true);
  const lastAppliedKey = useRef(cachedKey);

  // Refs for server-rendered data — avoids triggering the effect on new array references
  const initialAlumniRef = useRef(initialAlumni);
  const initialCountRef = useRef(initialCount);
  initialAlumniRef.current = initialAlumni;
  initialCountRef.current = initialCount;

  const fetchAlumni = useCallback(async (currentFilters: AlumniFilters, currentPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.query) params.set("q", currentFilters.query);
      if (currentFilters.graduation_years.length > 0)
        params.set("years", currentFilters.graduation_years.join(","));
      if (currentFilters.companies.length > 0) {
        params.set("companies", currentFilters.companies.join(","));
        params.set("company_match", currentFilters.company_match);
      }
      if (currentFilters.opt_statuses.length > 0)
        params.set("opt_statuses", currentFilters.opt_statuses.join(","));

      params.set("page", String(currentPage));
      params.set("limit", String(PAGE_LIMIT));

      const res = await fetch(`/api/alumni?${params}`);
      const json = await res.json();
      const data = json.data || [];
      const count = json.count || 0;
      const terms = json.matchTerms || [];
      setAlumni(data);
      setTotalCount(count);
      setMatchTerms(terms);

      // Cache results for instant restore on back-navigation
      const newKey = cacheKey(currentFilters, currentFilters.query || "", currentPage);
      directoryCache = {
        key: newKey,
        alumni: data,
        totalCount: count,
        matchTerms: terms,
      };
      lastAppliedKey.current = newKey;
    } catch (error) {
      console.error("Failed to fetch alumni:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchRef = useRef(
    debounce((newFilters: AlumniFilters, newPage: number) => {
      fetchAlumni(newFilters, newPage);
    }, 300)
  );

  // Sync URL search params when filters change (using history.pushState
  // to avoid triggering useSearchParams and causing an infinite loop)
  const debouncedUrlUpdateRef = useRef(
    debounce((newFilters: AlumniFilters, newSearchInput: string, newPage: number) => {
      const qs = buildSearchParams(newFilters, newSearchInput, newPage);
      const newUrl = qs ? `/directory?${qs}` : "/directory";
      // Only push if URL actually changed
      if (window.location.pathname + window.location.search !== newUrl) {
        window.history.pushState(null, "", newUrl);
      }
    }, 300)
  );

  // Restore filters when browser back/forward is used
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const parsed = parseFiltersFromParams(params);
      setSearchInput(parsed.searchInput);
      setFilters(parsed.filters);
      setPage(parsed.page);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const isDefault =
      !searchInput &&
      filters.graduation_years.length === 0 &&
      filters.companies.length === 0 &&
      filters.company_match === "all" &&
      filters.opt_statuses.length === 0;

    if (isDefault) {
      // Reset to server-rendered initial data
      setAlumni(initialAlumniRef.current);
      setTotalCount(initialCountRef.current);
      setMatchTerms([]);
      setPage(1);
      directoryCache = null;
      lastAppliedKey.current = "";
      debouncedUrlUpdateRef.current(filters, "", 1);
      return;
    }

    // First mount with active filters
    if (isFirstRun.current) {
      isFirstRun.current = false;
      if (!initialFetchDone.current) {
        // No cache — fetch immediately
        initialFetchDone.current = true;
        fetchAlumni({ ...filters, query: searchInput }, page);
      }
      // Cache hit — data already displayed via useState, skip fetch
      return;
    }

    // User changed filters — debounced fetch
    const currentKey = cacheKey({ ...filters, query: searchInput }, searchInput, 1);
    if (currentKey === lastAppliedKey.current) return;
    lastAppliedKey.current = currentKey;
    setPage(1);
    debouncedFetchRef.current({ ...filters, query: searchInput }, 1);
    debouncedUrlUpdateRef.current(filters, searchInput, 1);
  }, [searchInput, filters]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    const currentFilters = { ...filters, query: searchInput };
    fetchAlumni(currentFilters, newPage);
    const qs = buildSearchParams(filters, searchInput, newPage);
    const newUrl = qs ? `/directory?${qs}` : "/directory";
    window.history.replaceState(window.history.state, "", newUrl);
  }, [filters, searchInput, fetchAlumni]);

  const handleFilterChange = (partial: Partial<AlumniFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const totalPages = Math.ceil(totalCount / PAGE_LIMIT);

  return (
    <div className="space-y-6">
      <SearchBar value={searchInput} onChange={setSearchInput} />
      <FilterBar
        filters={{ ...filters, query: searchInput }}
        onFilterChange={handleFilterChange}
        years={years}
        companies={companies}
      />
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
  );
}
