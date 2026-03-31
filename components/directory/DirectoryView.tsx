"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SearchBar from "./SearchBar";
import FilterBar from "./FilterBar";
import AlumniGrid from "./AlumniGrid";
import { debounce } from "@/lib/utils";
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
  const router = useRouter();
  const initialParsed = parseFiltersFromParams(searchParams);

  const [alumni, setAlumni] = useState<Alumni[]>(initialAlumni);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(initialParsed.page);
  const [searchInput, setSearchInput] = useState(initialParsed.searchInput);
  const [matchTerms, setMatchTerms] = useState<string[]>([]);
  const [filters, setFilters] = useState<AlumniFilters>(
    initialParsed.filters
  );

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
      setAlumni(json.data || []);
      setTotalCount(json.count || 0);
      setMatchTerms(json.matchTerms || []);
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

  // Sync URL search params when filters change
  const debouncedUrlUpdateRef = useRef(
    debounce((newFilters: AlumniFilters, newSearchInput: string, newPage: number) => {
      const qs = buildSearchParams(newFilters, newSearchInput, newPage);
      const newUrl = qs ? `/directory?${qs}` : "/directory";
      router.replace(newUrl, { scroll: false });
    }, 300)
  );

  // Re-read URL params when searchParams change (e.g. browser back/forward)
  const prevParamsRef = useRef(searchParams.toString());
  useEffect(() => {
    const currentParamsStr = searchParams.toString();
    if (currentParamsStr !== prevParamsRef.current) {
      prevParamsRef.current = currentParamsStr;
      const parsed = parseFiltersFromParams(searchParams);
      setSearchInput(parsed.searchInput);
      setFilters(parsed.filters);
      setPage(parsed.page);
    }
  }, [searchParams]);

  useEffect(() => {
    const isDefault =
      !searchInput &&
      filters.graduation_years.length === 0 &&
      filters.companies.length === 0 &&
      filters.company_match === "all" &&
      filters.opt_statuses.length === 0;

    if (isDefault) {
      // Reset to server-rendered initial data
      setAlumni(initialAlumni);
      setTotalCount(initialCount);
      setMatchTerms([]);
      setPage(1);
      debouncedUrlUpdateRef.current(filters, "", 1);
      return;
    }

    setPage(1);
    debouncedFetchRef.current({ ...filters, query: searchInput }, 1);
    debouncedUrlUpdateRef.current(filters, searchInput, 1);
  }, [searchInput, filters, initialAlumni, initialCount]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    const currentFilters = { ...filters, query: searchInput };
    fetchAlumni(currentFilters, newPage);
    const qs = buildSearchParams(filters, searchInput, newPage);
    const newUrl = qs ? `/directory?${qs}` : "/directory";
    router.replace(newUrl, { scroll: false });
  }, [filters, searchInput, fetchAlumni, router]);

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
