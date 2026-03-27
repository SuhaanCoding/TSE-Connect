"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import EditAlumniModal from "./EditAlumniModal";
import AddAlumniModal from "./AddAlumniModal";
import type { Alumni, OptStatus, ScrapeResult } from "@/lib/types";

interface AdminEntry {
  id: string;
  email: string;
  created_at: string;
}

type SortKey = "full_name" | "current_company" | "graduation_year" | "opt_status" | "login_email" | "last_scraped_at";

export default function AdminDashboard() {
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [editingAlumni, setEditingAlumni] = useState<Alumni | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [tab, setTab] = useState<"alumni" | "admins" | "scrape">("alumni");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const actionRef = useRef<HTMLTableCellElement>(null);

  // Scrape state
  const [scrapeRunId, setScrapeRunId] = useState<string | null>(null);
  const [scrapeDatasetId, setScrapeDatasetId] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [scrapeProfileCount, setScrapeProfileCount] = useState<number>(0);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scraping, setScraping] = useState(false);
  const [processing, setProcessing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CSV import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close action menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) {
        setActionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [alumniRes, adminsRes] = await Promise.all([
      fetch("/api/admin/alumni"),
      fetch("/api/admin/admins"),
    ]);
    const alumniData = await alumniRes.json();
    const adminsData = await adminsRes.json();
    setAlumni(alumniData.data || []);
    setAdmins(adminsData.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stats
  const stats = {
    total: alumni.length,
    optedIn: alumni.filter((a) => a.opt_status === "opted_in").length,
    notConfirmed: alumni.filter((a) => a.opt_status === "not_confirmed").length,
    optedOut: alumni.filter((a) => a.opt_status === "opted_out").length,
    claimed: alumni.filter((a) => a.auth_id).length,
    unclaimed: alumni.filter((a) => !a.auth_id).length,
  };

  const linkedinCount = alumni.filter((a) => a.linkedin_url).length;

  // Filter + sort
  const filtered = alumni
    .filter(
      (a) =>
        a.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (a.current_company || "").toLowerCase().includes(search.toLowerCase()) ||
        (a.login_email || "").toLowerCase().includes(search.toLowerCase()) ||
        (a.contact_email || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const valA = (a[sortKey] || "") as string;
      const valB = (b[sortKey] || "") as string;
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="text-text-muted/30 ml-1">↕</span>;
    return <span className="text-accent ml-1">{sortAsc ? "↑" : "↓"}</span>;
  };

  // Actions
  const apiAction = async (
    method: string,
    url: string,
    body: Record<string, unknown>,
    successMsg: string
  ) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setToast(successMsg);
      fetchData();
    } else {
      const data = await res.json();
      setToast(data.error || "Action failed");
    }
    setActionMenuId(null);
  };

  const resetAccount = (a: Alumni) =>
    apiAction("PUT", "/api/admin/alumni", {
      id: a.id,
      auth_id: null,
      login_email: null,
      avatar_url: null,
      opt_status: "not_confirmed",
    }, `Reset ${a.full_name}'s account`);

  const forceOptIn = (a: Alumni) =>
    apiAction("PUT", "/api/admin/alumni", { id: a.id, opt_status: "opted_in" }, `${a.full_name} set to opted in`);

  const forceOptOut = (a: Alumni) =>
    apiAction("PUT", "/api/admin/alumni", { id: a.id, opt_status: "opted_out" }, `${a.full_name} set to opted out`);

  const deleteAlumni = (a: Alumni) => {
    if (!confirm(`Delete ${a.full_name}? This cannot be undone.`)) return;
    apiAction("DELETE", "/api/admin/alumni", { id: a.id }, `Deleted ${a.full_name}`);
  };

  const unassign = (a: Alumni) =>
    apiAction("DELETE", "/api/admin/alumni/assign", { alumni_id: a.id }, `Unassigned ${a.full_name}`);

  const handleModalSave = async (data: Partial<Alumni> & { id: string }) => {
    await apiAction("PUT", "/api/admin/alumni", data, "Updated successfully");
    setEditingAlumni(null);
  };

  const handleAddSave = async (data: Record<string, unknown>) => {
    const res = await fetch("/api/admin/alumni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setToast(`Added ${data.full_name}`);
      setShowAddModal(false);
      fetchData();
    } else {
      const err = await res.json();
      setToast(err.error || "Failed to add alumni");
    }
  };

  // Bulk — process in batches of 10
  const bulkUpdateStatus = async (status: OptStatus) => {
    const ids = Array.from(selectedIds);
    let done = 0;
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await Promise.all(
        batch.map((id) =>
          fetch("/api/admin/alumni", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, opt_status: status }),
          })
        )
      );
      done += batch.length;
    }
    setToast(`Updated ${done} alumni`);
    setSelectedIds(new Set());
    fetchData();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} alumni? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await Promise.all(
        batch.map((id) =>
          fetch("/api/admin/alumni", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          })
        )
      );
    }
    setToast(`Deleted ${selectedIds.size} alumni`);
    setSelectedIds(new Set());
    fetchData();
  };

  // Export CSV
  const exportCSV = () => {
    const headers = [
      "full_name", "graduation_year", "current_role", "current_company",
      "linkedin_url", "contact_email", "login_email", "preferred_contact",
      "opt_status", "past_companies", "last_scraped_at",
    ];
    const rows = alumni.map((a) =>
      headers.map((h) => {
        const val = a[h as keyof Alumni];
        if (Array.isArray(val)) return val.join("; ");
        return String(val || "");
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""').replace(/\n/g, " ").replace(/\r/g, "")}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tse-alumni-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // CSV Import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) {
        setToast(`Imported ${data.imported} alumni`);
        fetchData();
      }
    } catch {
      setToast("Import failed");
    } finally {
      setImporting(false);
      // Reset file input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Scrape functions
  const startScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    setScrapeStatus(null);
    setScrapeDatasetId(null);

    try {
      const res = await fetch("/api/admin/scrape", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setToast(data.error || "Failed to start scrape");
        setScraping(false);
        return;
      }

      setScrapeRunId(data.runId);
      setScrapeDatasetId(data.datasetId);
      setScrapeProfileCount(data.profileCount);
      setScrapeStatus("RUNNING");

      // Start polling for status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/admin/scrape?runId=${data.runId}`);
          const statusData = await statusRes.json();
          setScrapeStatus(statusData.status);

          if (statusData.datasetId) {
            setScrapeDatasetId(statusData.datasetId);
          }

          if (statusData.status !== "RUNNING" && statusData.status !== "READY") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setScraping(false);

            if (statusData.status !== "SUCCEEDED") {
              setToast(`Scrape ended with status: ${statusData.status}`);
            }
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 5000);
    } catch {
      setToast("Failed to start scrape");
      setScraping(false);
    }
  };

  const processResults = async () => {
    if (!scrapeDatasetId) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/admin/scrape", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: scrapeDatasetId }),
      });
      const data = await res.json();

      if (res.ok) {
        setScrapeResult(data);
        setToast(`Updated ${data.updated} alumni from LinkedIn`);
        fetchData();
      } else {
        setToast(data.error || "Failed to process results");
      }
    } catch {
      setToast("Failed to process scrape results");
    } finally {
      setProcessing(false);
    }
  };

  const resetScrape = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setScrapeRunId(null);
    setScrapeDatasetId(null);
    setScrapeStatus(null);
    setScrapeResult(null);
    setScraping(false);
    setProcessing(false);
  };

  // Admin management
  const addAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    await apiAction("POST", "/api/admin/admins", { email: newAdminEmail.trim() }, `Added ${newAdminEmail} as admin`);
    setNewAdminEmail("");
  };

  const removeAdmin = (email: string) => {
    if (!confirm(`Remove ${email} as admin?`)) return;
    apiAction("DELETE", "/api/admin/admins", { email }, `Removed ${email}`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(
      selectedIds.size === filtered.length
        ? new Set()
        : new Set(filtered.map((a) => a.id))
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading font-bold text-3xl tracking-tight">Admin Dashboard</h1>
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {editingAlumni && (
        <EditAlumniModal
          alumni={editingAlumni}
          onSave={handleModalSave}
          onClose={() => setEditingAlumni(null)}
        />
      )}
      {showAddModal && (
        <AddAlumniModal
          onSave={handleAddSave}
          onClose={() => setShowAddModal(false)}
        />
      )}

      <div className="space-y-6">
        <h1 className="font-heading font-bold text-3xl tracking-tight">
          Admin Dashboard
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Opted In", value: stats.optedIn, color: "text-emerald-400" },
            { label: "Unconfirmed", value: stats.notConfirmed, color: "text-text-muted" },
            { label: "Opted Out", value: stats.optedOut, color: "text-red-400" },
            { label: "Claimed", value: stats.claimed, color: "text-accent" },
            { label: "Unclaimed", value: stats.unclaimed, color: "text-yellow-400" },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-lg p-3 text-center">
              <p className={`font-heading font-bold text-2xl ${s.color}`}>{s.value}</p>
              <p className="text-xs text-text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["alumni", "scrape", "admins"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t
                  ? "border-accent text-foreground"
                  : "border-transparent text-text-muted hover:text-foreground"
              }`}
            >
              {t === "alumni"
                ? `Alumni (${alumni.length})`
                : t === "admins"
                  ? `Admins (${admins.length})`
                  : "Scrape"}
            </button>
          ))}
        </div>

        {/* ALUMNI TAB */}
        {tab === "alumni" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by name, company, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                Add Person
              </Button>
              <Button size="sm" variant="secondary" onClick={exportCSV}>
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                loading={importing}
              >
                {importing ? "Importing..." : "Import CSV"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-muted">{selectedIds.size} selected</span>
                  <Button size="sm" variant="secondary" onClick={() => bulkUpdateStatus("opted_in")}>Opt In</Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkUpdateStatus("not_confirmed")}>Reset Status</Button>
                  <Button size="sm" variant="ghost" onClick={bulkDelete}>Delete</Button>
                </div>
              )}
            </div>

            {/* Import result banner */}
            {importResult && (
              <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Import Results</h3>
                  <button
                    onClick={() => setImportResult(null)}
                    className="text-text-muted hover:text-foreground text-xs cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-text-muted">Imported:</span>{" "}
                    <span className="text-emerald-400 font-medium">{importResult.imported}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Skipped:</span>{" "}
                    <span className="text-text-secondary">{importResult.skipped}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Total rows:</span>{" "}
                    <span className="text-text-secondary">{importResult.total}</span>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-red-400 font-medium mb-1">Errors:</p>
                    <ul className="text-xs text-text-muted space-y-0.5">
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>...and {importResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-text-muted">{filtered.length} of {alumni.length} alumni</p>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface text-left">
                    <th className="p-3 w-10">
                      <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="accent-accent" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("full_name")}>
                      Name <SortIcon column="full_name" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("current_company")}>
                      Company <SortIcon column="current_company" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("graduation_year")}>
                      Year <SortIcon column="graduation_year" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("opt_status")}>
                      Status <SortIcon column="opt_status" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("login_email")}>
                      Account <SortIcon column="login_email" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary cursor-pointer select-none" onClick={() => handleSort("last_scraped_at")}>
                      Scraped <SortIcon column="last_scraped_at" />
                    </th>
                    <th className="p-3 font-medium text-text-secondary w-16">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-t border-border hover:bg-surface/50">
                      <td className="p-3">
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} className="accent-accent" />
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{a.full_name}</span>
                        {a.current_role && <span className="text-text-muted text-xs block">{a.current_role}</span>}
                      </td>
                      <td className="p-3 text-text-secondary">{a.current_company || "—"}</td>
                      <td className="p-3 text-text-secondary">{a.graduation_year || "—"}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          a.opt_status === "opted_in" ? "bg-emerald-500/10 text-emerald-400" :
                          a.opt_status === "opted_out" ? "bg-red-500/10 text-red-400" :
                          "bg-[rgba(250,250,248,0.06)] text-text-muted"
                        }`}>
                          {a.opt_status === "opted_in" ? "In" : a.opt_status === "opted_out" ? "Out" : "?"}
                        </span>
                      </td>
                      <td className="p-3">
                        {a.auth_id ? (
                          <span className="text-xs text-emerald-400 truncate block max-w-[140px]">{a.login_email || "Linked"}</span>
                        ) : (
                          <span className="text-xs text-text-muted">Unclaimed</span>
                        )}
                      </td>
                      <td className="p-3 text-text-muted text-xs">
                        {a.last_scraped_at
                          ? new Date(a.last_scraped_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="p-3 relative" ref={actionMenuId === a.id ? actionRef : undefined}>
                        <button
                          onClick={() => setActionMenuId(actionMenuId === a.id ? null : a.id)}
                          className="text-text-muted hover:text-foreground cursor-pointer p-1"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                          </svg>
                        </button>
                        {actionMenuId === a.id && (
                          <div className="absolute right-0 top-full z-30 w-48 rounded-lg bg-surface border border-border shadow-lg py-1">
                            <ActionItem label="Edit all fields" onClick={() => { setEditingAlumni(a); setActionMenuId(null); }} />
                            <ActionItem label="View profile" onClick={() => { window.open(`/profile/${a.id}`, "_blank"); setActionMenuId(null); }} />
                            <div className="border-t border-border my-1" />
                            <ActionItem label="Force opt-in" onClick={() => forceOptIn(a)} className="text-emerald-400" />
                            <ActionItem label="Force opt-out" onClick={() => forceOptOut(a)} className="text-yellow-400" />
                            {a.auth_id && (
                              <>
                                <div className="border-t border-border my-1" />
                                <ActionItem label="Reset account" onClick={() => resetAccount(a)} className="text-yellow-400" />
                                <ActionItem label="Unassign account" onClick={() => unassign(a)} className="text-yellow-400" />
                              </>
                            )}
                            <div className="border-t border-border my-1" />
                            <ActionItem label="Delete" onClick={() => deleteAlumni(a)} className="text-red-400" />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SCRAPE TAB */}
        {tab === "scrape" && (
          <div className="space-y-6 max-w-lg">
            <div>
              <h2 className="font-heading font-semibold text-lg mb-2">LinkedIn Scrape</h2>
              <p className="text-sm text-text-muted mb-1">
                Scrape LinkedIn profiles for all alumni with LinkedIn URLs. Career data (role, company, past companies) will be updated automatically.
              </p>
              <p className="text-sm text-text-muted mb-4">
                <span className="text-accent font-medium">{linkedinCount}</span> alumni with LinkedIn URLs.
                {linkedinCount > 0 && (
                  <span className="text-text-muted/60"> Estimated cost: ~${((linkedinCount / 1000) * 4).toFixed(2)}</span>
                )}
              </p>
            </div>

            {/* Stage 1: Idle — no active run */}
            {!scrapeRunId && !scrapeResult && (
              <Button onClick={startScrape} loading={scraping} disabled={linkedinCount === 0}>
                Start LinkedIn Scrape
              </Button>
            )}

            {/* Stage 2: Running — polling for status */}
            {scrapeRunId && scrapeStatus && scrapeStatus !== "SUCCEEDED" && !scrapeResult && (
              <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-accent animate-pulse" />
                  <span className="text-sm font-medium">Scraping {scrapeProfileCount} profiles...</span>
                </div>
                <p className="text-xs text-text-muted">
                  Status: <span className="text-text-secondary font-medium">{scrapeStatus}</span>
                  {" "}— Checking every 5 seconds
                </p>
                <p className="text-xs text-text-muted/60">
                  Run ID: {scrapeRunId}
                </p>
              </div>
            )}

            {/* Stage 3: Succeeded — ready to process */}
            {scrapeStatus === "SUCCEEDED" && !scrapeResult && (
              <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="text-sm font-medium">Scrape complete!</span>
                </div>
                <p className="text-sm text-text-muted">
                  {scrapeProfileCount} profiles scraped. Ready to process results and update the database.
                </p>
                <div className="flex gap-2">
                  <Button onClick={processResults} loading={processing}>
                    {processing ? "Processing..." : "Process Results"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetScrape}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Stage 4: Results displayed */}
            {scrapeResult && (
              <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-sm">Scrape Results</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-text-muted">Matched:</span>{" "}
                    <span className="text-emerald-400 font-medium">{scrapeResult.matched}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Updated:</span>{" "}
                    <span className="text-accent font-medium">{scrapeResult.updated}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Skipped (empty data):</span>{" "}
                    <span className="text-text-secondary">{scrapeResult.skippedEmpty}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">No match:</span>{" "}
                    <span className="text-text-secondary">{scrapeResult.noMatch}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Errors:</span>{" "}
                    <span className={scrapeResult.errors > 0 ? "text-red-400 font-medium" : "text-text-secondary"}>
                      {scrapeResult.errors}
                    </span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={resetScrape}>
                  Start New Scrape
                </Button>
              </div>
            )}

          </div>
        )}

        {/* ADMINS TAB */}
        {tab === "admins" && (
          <div className="space-y-6">
            <div className="flex gap-3 items-end">
              <div className="flex-1 max-w-sm">
                <Input
                  label="Add new admin"
                  placeholder="email@example.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAdmin()}
                />
              </div>
              <Button onClick={addAdmin}>Add Admin</Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface text-left">
                    <th className="p-3 font-medium text-text-secondary">Email</th>
                    <th className="p-3 font-medium text-text-secondary">Added</th>
                    <th className="p-3 font-medium text-text-secondary w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id} className="border-t border-border">
                      <td className="p-3 font-medium">{admin.email}</td>
                      <td className="p-3 text-text-muted">{new Date(admin.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <button onClick={() => removeAdmin(admin.email)} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ActionItem({
  label,
  onClick,
  className = "text-text-secondary",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[rgba(250,250,248,0.05)] cursor-pointer ${className}`}
    >
      {label}
    </button>
  );
}

