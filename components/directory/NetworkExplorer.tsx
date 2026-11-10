"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AlumniCard from "./AlumniCard";
import SearchBar from "./SearchBar";
import ResumeMatching from "./ResumeMatching";
import { ServerMatchClient } from "@/lib/matching/client";
import { localMatchResult } from "@/lib/matching/result";
import Button from "@/components/ui/Button";
import {
  COMPANY_CATEGORIES,
  NETWORK_GOALS,
  parseNetworkFilters,
  outreachDraft,
  type NetworkFilters,
  type NetworkProfile,
} from "@/lib/network";

type Mode = "ranked" | "smart" | "wildcard";
interface Result {
  engine?: "semantic" | "lexical";
  semanticReady?: number;
  data: NetworkProfile[];
  total: number;
  page: number;
  pages: number;
  poolCount: number;
  companyCoverage: { tagged: number; total: number };
  viewer: {
    id: string;
    name: string;
    optedIn: boolean;
    hasProfileText: boolean;
  };
  facets: { id: string; count: number }[];
}
const selectClass =
  "w-full rounded-lg border border-border bg-input-bg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer";
const chipClass =
  "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
function queryFor(filters: NetworkFilters, page: number) {
  const params = new URLSearchParams({ view: "ranked" });
  if (filters.query) params.set("q", filters.query);
  if (filters.goal !== "interests") params.set("goal", filters.goal);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.categories.length)
    params.set("categories", filters.categories.join(","));
  for (const company of filters.companies) params.append("company", company);
  if (filters.year) params.set("year", filters.year);
  if (filters.optedOnly) params.set("opted", "1");
  if (page > 1) params.set("page", String(page));
  return params;
}

export default function NetworkExplorer({
  years,
  companies,
}: {
  years: string[];
  companies: string[];
}) {
  const params = useSearchParams();
  const [localEnabled, setLocalEnabled] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [personalGoal, setPersonalGoal] = useState("");
  const [localProgress, setLocalProgress] = useState("");
  const [localWarning, setLocalWarning] = useState("");
  const [lexicalOnly, setLexicalOnly] = useState(false);
  const matcher = useRef<ServerMatchClient | null>(null);
  useEffect(() => () => matcher.current?.dispose(), []);
  const restartLocal = (wordsOnly = false) => {
    matcher.current?.dispose();
    matcher.current = null;
    setLexicalOnly(wordsOnly);
    setLocalEnabled(true);
    setLocalWarning("");
    setRetry((value) => value + 1);
  };
  const [filters, setFilters] = useState(() => parseNetworkFilters(params));
  const [page, setPage] = useState(() =>
    Math.max(1, Number(params.get("page")) || 1),
  );
  const [mode, setMode] = useState<Mode>("ranked"),
    [draw, setDraw] = useState(0),
    [retry, setRetry] = useState(0),
    [composing, setComposing] = useState(false);
  const [result, setResult] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [draftPerson, setDraftPerson] = useState<NetworkProfile | null>(null),
    [draft, setDraft] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const draftField = useRef<HTMLTextAreaElement>(null),
    draftPanel = useRef<HTMLDivElement>(null);
  const draftTrigger = useRef<HTMLElement | null>(null);
  const immediate = useRef(false);
  const previous = useRef<string[]>([]);
  const lastFilters = useRef("");
  const change = (partial: Partial<NetworkFilters>) => {
    setFilters((old) => ({ ...old, ...partial }));
    setPage(1);
    setMode("ranked");
    previous.current = [];
  };
  useEffect(() => {
    const pop = () => {
      const current = new URLSearchParams(window.location.search);
      setFilters(parseNetworkFilters(current));
      setPage(Math.max(1, Number(current.get("page")) || 1));
      setMode("ranked");
      previous.current = [];
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (composing) return;
    const controller = new AbortController();
    const delay = immediate.current || !filters.query ? 0 : 300;
    immediate.current = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const qs = queryFor(filters, page),
        key = queryFor(filters, 1).toString();
      if (lastFilters.current !== key) {
        previous.current = [];
        lastFilters.current = key;
      }
      const url = `/directory?${qs}`;
      if (window.location.pathname + window.location.search !== url)
        window.history.pushState(null, "", url);
      if (mode !== "ranked") {
        qs.set("mode", mode);
        previous.current.forEach((id) => qs.append("skip", id));
      }
      try {
        let json: Result;
        if (localEnabled) {
          const engine = (matcher.current ??= new ServerMatchClient(
            setLocalProgress,
            lexicalOnly,
          ));
          const ranked = await engine.rank(
            resumeText,
            filters.query || personalGoal,
            filters.query,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setLocalWarning(ranked.warning);
          json = localMatchResult(
            ranked.index,
            ranked.hits,
            filters,
            page,
            mode,
            previous.current,
            ranked.engine,
          );
        } else {
          const response = await fetch(`/api/alumni/matches?${qs}`, {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
            cache: "no-store",
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(
              payload?.error || "Couldn’t load your network. Try again.",
            );
          if (controller.signal.aborted) return;
          if (!payload || !Array.isArray(payload.data))
            throw new Error("Couldn’t load your network. Try again.");
          json = payload;
        }
        setResult(json);
        if (mode !== "ranked")
          previous.current = [
            ...previous.current,
            ...json.data.map((person: NetworkProfile) => person.id),
          ];
        if (mode === "ranked" && json.page !== page) setPage(json.page);
      } catch (err) {
        if (!controller.signal.aborted) {
          if (localEnabled) {
            matcher.current?.dispose();
            matcher.current = null;
          }
          setError(
            err instanceof Error &&
              /^(Couldn’t|Sign in|Complete your|Your browser|Local matching|The matching|On-device)/.test(
                err.message,
              )
              ? err.message
              : "Couldn’t load your network. Check your connection and try again.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    filters,
    page,
    mode,
    draw,
    retry,
    composing,
    localEnabled,
    resumeText,
    personalGoal,
    lexicalOnly,
  ]);
  const viewer = result?.viewer;
  useEffect(() => {
    if (draftField.current) {
      draftField.current.style.height = "auto";
      draftField.current.style.height = `${draftField.current.scrollHeight}px`;
    }
  }, [draft]);
  const reset = () =>
    change({
      goal: "interests",
      categories: [],
      companies: [],
      scope: "all",
      year: "",
      query: "",
      optedOnly: false,
    });
  const openDraft = (person: NetworkProfile) => {
    draftTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDraftPerson(person);
    let text = outreachDraft(viewer?.name || "", person, filters.goal);
    try {
      text =
        sessionStorage.getItem(`tse-draft-${viewer?.id}-${person.id}`) || text;
    } catch {}
    setDraft(text.slice(0, 2000));
    setCopyStatus("");
  };
  useEffect(() => {
    if (draftPerson) {
      draftPanel.current?.scrollIntoView({
        behavior: "instant",
        block: "center",
      });
      draftField.current?.focus();
    }
  }, [draftPerson]);
  useEffect(() => {
    if (!draftPerson || !viewer?.id) return;
    try {
      sessionStorage.setItem(
        `tse-draft-${viewer.id}-${draftPerson.id}`,
        draft.slice(0, 2000),
      );
      // Acknowledge the external session-storage write.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [draft, draftPerson, viewer?.id]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy didn’t work. Select the text and copy it manually.");
      draftField.current?.focus();
      draftField.current?.select();
    }
  };
  const pending = loading || composing;
  const canDraft = (person: NetworkProfile) =>
    !!viewer?.optedIn && person.opt_status !== "opted_out";
  return (
    <div className="space-y-6">
      <SearchBar
        value={filters.query}
        onChange={(query) => change({ query })}
        onCompositionChange={setComposing}
        onSubmit={() => {
          immediate.current = true;
          setRetry((value) => value + 1);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-xs text-text-secondary">
          <span>Focus</span>
          <select
            className={selectClass}
            value={filters.goal}
            onChange={(event) =>
              change({ goal: event.target.value as NetworkFilters["goal"] })
            }
          >
            {NETWORK_GOALS.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-xs text-text-secondary">
          <span>Employer history</span>
          <select
            className={selectClass}
            value={filters.scope}
            onChange={(event) =>
              change({ scope: event.target.value as NetworkFilters["scope"] })
            }
          >
            <option value="all">Current & past</option>
            <option value="current">Current only</option>
            <option value="past">Past only</option>
          </select>
        </label>
        <label className="space-y-2 text-xs text-text-secondary">
          <span>Company</span>
          <select
            className={selectClass}
            value=""
            onChange={(event) => {
              if (
                event.target.value &&
                !filters.companies.includes(event.target.value)
              )
                change({
                  companies: [...filters.companies, event.target.value].slice(
                    0,
                    10,
                  ),
                });
            }}
          >
            <option value="">Any company</option>
            {companies
              .filter((company) => !filters.companies.includes(company))
              .map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-2 text-xs text-text-secondary">
          <span>Graduation year</span>
          <select
            className={selectClass}
            value={filters.year}
            onChange={(event) => change({ year: event.target.value })}
          >
            <option value="">All years</option>
            {years.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-3">
        <p className="text-xs text-text-muted">Categories</p>
        <div id="company-categories" className="flex flex-wrap gap-2">
          {COMPANY_CATEGORIES.filter(
            (category, index) =>
              categoriesExpanded ||
              category.featured ||
              index < 8 ||
              filters.categories.includes(category.id),
          ).map((category) => {
            const selected = filters.categories.includes(category.id);
            return (
              <button
                key={category.id}
                aria-pressed={selected}
                aria-label={`${category.label}, ${result?.facets.find((facet) => facet.id === category.id)?.count ?? "loading"} people`}
                className={`${chipClass} ${selected ? "border-accent bg-accent/15 text-accent-light" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}
                onClick={() =>
                  change({
                    categories: selected
                      ? filters.categories.filter((id) => id !== category.id)
                      : [...filters.categories, category.id],
                  })
                }
              >
                {category.label}
                <span className="ml-1.5 text-text-muted">
                  {result?.facets.find((facet) => facet.id === category.id)
                    ?.count ?? "–"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={categoriesExpanded}
            aria-controls="company-categories"
            onClick={() => setCategoriesExpanded((value) => !value)}
          >
            {categoriesExpanded
              ? "Fewer categories"
              : `All ${COMPANY_CATEGORIES.length} categories`}
          </Button>
        </div>
        {filters.companies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.companies.map((company) => (
              <button
                key={company}
                className={`${chipClass} border-accent/40 text-accent-light`}
                aria-label={`Remove company filter ${company}`}
                onClick={() =>
                  change({
                    companies: filters.companies.filter(
                      (value) => value !== company,
                    ),
                  })
                }
              >
                {company} ×
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={filters.optedOnly}
              onChange={(event) => change({ optedOnly: event.target.checked })}
              className="accent-accent"
            />
            Opted in only
          </label>
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </div>
      <ResumeMatching
        wordOnly={result?.engine === "lexical"}
        failed={!!error}
        enabled={localEnabled}
        busy={pending}
        progress={localProgress}
        warning={localWarning}
        activeResume={!!resumeText || !!personalGoal}
        onEnable={() => restartLocal(false)}
        onDisable={() => {
          matcher.current?.dispose();
          matcher.current = null;
          setLocalEnabled(false);
          setLocalWarning("");
        }}
        onLexical={() => restartLocal(true)}
        onRefresh={() => restartLocal(lexicalOnly)}
        onApply={(text, goal) => {
          setResumeText(text);
          setPersonalGoal(goal);
          setLocalEnabled(true);
          setPage(1);
          setMode("ranked");
          previous.current = [];
        }}
        onForget={() => {
          matcher.current?.dispose();
          matcher.current = null;
          setResumeText("");
          setPersonalGoal("");
          setLocalEnabled(false);
          setLocalWarning("");
          setPage(1);
          setMode("ranked");
          previous.current = [];
        }}
      />
      {draftPerson && (
        <div
          ref={draftPanel}
          className="rounded-xl border border-accent/40 bg-surface p-5"
        >
          <h2 className="font-heading font-semibold">
            Message {draftPerson.full_name.split(" ")[0]}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Personalize your message before copying.
          </p>
          <label
            className="mt-4 block text-xs text-text-secondary"
            htmlFor="outreach-draft"
          >
            Your message
          </label>
          <textarea
            ref={draftField}
            id="outreach-draft"
            className="mt-2 min-h-48 w-full resize-none rounded-lg border border-border bg-input-bg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
            value={draft}
            maxLength={2000}
            onChange={(event) => {
              setDraft(event.target.value);
              setCopyStatus("");
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button size="sm" onClick={copy} disabled={!draft.trim()}>
              Copy message
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftPerson(null);
                setCopyStatus("");
                draftTrigger.current?.focus();
              }}
            >
              Close
            </Button>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            {draftSaved
              ? "Saved for this session."
              : "Copy before leaving; session storage is unavailable."}
          </p>
          <p role="status" className="mt-3 text-xs text-text-secondary">
            {copyStatus}
          </p>
        </div>
      )}
      <section aria-labelledby="ranking-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="ranking-title"
              className="font-heading text-xl font-semibold"
            >
              Your network
            </h2>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <p role="status" className="text-text-muted">
                {pending
                  ? "Loading…"
                  : error
                    ? ""
                    : `${mode === "ranked" ? (result?.total ?? 0) : (result?.data.length ?? 0)} ${mode === "ranked" ? "alumni" : "picks"}`}
              </p>
              <Link
                href="/settings"
                className="rounded text-accent-light hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Edit interests
              </Link>
            </div>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Discovery mode"
          >
            <Button
              size="sm"
              variant={mode === "ranked" ? "primary" : "secondary"}
              onClick={() => setMode("ranked")}
              disabled={pending}
              aria-pressed={mode === "ranked"}
            >
              Ranked
            </Button>
            <Button
              size="sm"
              variant={mode === "smart" ? "primary" : "secondary"}
              aria-pressed={mode === "smart"}
              disabled={pending || result?.total === 0}
              onClick={() => {
                setMode("smart");
                setDraw((value) => value + 1);
              }}
            >
              Smart shuffle
            </Button>
            <Button
              size="sm"
              variant={mode === "wildcard" ? "primary" : "secondary"}
              aria-pressed={mode === "wildcard"}
              disabled={pending || result?.total === 0}
              onClick={() => {
                setMode("wildcard");
                setDraw((value) => value + 1);
              }}
            >
              Wildcard
            </Button>
          </div>
        </div>
        {error ? (
          <div role="alert" className="rounded-xl border border-border p-6">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              className="mt-4"
              size="sm"
              variant="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : pending ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3 rounded-xl border border-border text-sm text-text-muted"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
            />
            Loading matches…
          </div>
        ) : !result?.data.length ? (
          <div className="rounded-xl border border-border p-8 text-center">
            <h3 className="font-heading text-lg font-semibold">
              No people in this combination
            </h3>
            <p className="mt-2 text-sm text-text-muted">
              Try a broader category, employer history or graduation year.
            </p>
            <Button className="mt-4" variant="secondary" onClick={reset}>
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {result.data.map((person, index) => (
              <AlumniCard
                key={person.id}
                alumni={person}
                index={index}
                viewerOptedIn={result.viewer.optedIn}
                ranking={person}
                actions={
                  <div className="space-y-3">
                    {person.company_signals.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {[
                          ...new Map(
                            person.company_signals.map((signal) => [
                              signal.category,
                              signal,
                            ]),
                          ).values(),
                        ]
                          .slice(0, 2)
                          .map((signal) => (
                            <button
                              key={signal.category}
                              className="cursor-pointer rounded-full border border-border px-2 py-1 text-[10px] text-text-secondary hover:text-accent-light focus-visible:ring-2 focus-visible:ring-accent"
                              title={`${signal.tenure} employer: ${signal.company}; ${signal.method}: ${signal.matchedName}; category is a proxy`}
                              onClick={() =>
                                change({ categories: [signal.category] })
                              }
                            >
                              {signal.label}
                              {signal.method === "near name" ? " ≈" : " ↗"}
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {canDraft(person) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDraft(person)}
                        >
                          Draft message
                          <span className="sr-only">
                            {" "}
                            to {person.full_name}
                          </span>
                        </Button>
                      )}
                    </div>
                    {person.opt_status === "not_confirmed" && (
                      <p className="text-[11px] text-text-muted">
                        Participation unconfirmed
                      </p>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
        {mode === "ranked" && result && result.pages > 1 && !error && (
          <nav
            aria-label="Ranked results pages"
            className="flex items-center justify-center gap-4 pt-2"
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || result.page <= 1}
              onClick={() => setPage(result.page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-text-muted">
              Page {result.page} of {result.pages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || result.page >= result.pages}
              onClick={() => setPage(result.page + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
