"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SearchBar from "./SearchBar";
import FilterBar from "./FilterBar";
import AlumniGrid from "./AlumniGrid";
import { debounce } from "@/lib/utils";
import type { Alumni, AlumniFilters } from "@/lib/types";

const PAGE_LIMIT = 24;

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
  const [alumni, setAlumni] = useState<Alumni[]>(initialAlumni);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [matchTerms, setMatchTerms] = useState<string[]>([]);
  const [filters, setFilters] = useState<AlumniFilters>({
    query: "",
    graduation_years: [],
    companies: [],
    company_match: "all",

    opt_status: null,
  });

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

      if (currentFilters.opt_status)
        params.set("opt_status", currentFilters.opt_status);
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

  useEffect(() => {
    // Don't fetch if filters are at defaults — server data is already current
    const isDefault =
      !searchInput &&
      filters.graduation_years.length === 0 &&
      filters.companies.length === 0 &&
      filters.company_match === "all" &&
      !filters.opt_status;

    if (isDefault) return;

    setPage(1);
    debouncedFetchRef.current({ ...filters, query: searchInput }, 1);
  }, [searchInput, filters]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    const currentFilters = { ...filters, query: searchInput };
    fetchAlumni(currentFilters, newPage);
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
