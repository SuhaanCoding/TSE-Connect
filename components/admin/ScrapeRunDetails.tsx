import Link from "next/link";
import Button from "@/components/ui/Button";
import type { ScrapeOutcome } from "@/lib/linkedin-profile";

const FIELD_LABELS: Record<string, string> = {
  current_role: "role",
  current_company: "company",
  past_companies: "company history",
  linkedin_about: "About",
  linkedin_background: "work/project descriptions",
  graduation_year: "verified graduation year",
  linkedin_url: "LinkedIn address",
};
export default function ScrapeRunDetails({
  results,
  date,
  busy,
  onRetry,
}: {
  results: ScrapeOutcome[];
  date: string;
  busy: boolean;
  onRetry: () => void;
}) {
  const unresolved = results.filter((result) => result.status !== "updated");
  const sorted = [
    ...unresolved,
    ...results.filter((result) => result.status === "updated"),
  ];
  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        Profile results · {new Date(date).toLocaleDateString()} ·{" "}
        {unresolved.length} unresolved of {results.length}
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-text-muted">
          Updated means the listed visible fields were imported. Hidden or
          missing fields keep their existing values.
        </p>
        {unresolved.some((result) => result.alumniIds.length > 0) && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onRetry}
          >
            Retry unresolved profiles
          </Button>
        )}
        <div
          tabIndex={0}
          aria-label="Profile import results"
          className="max-h-80 overflow-y-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ul className="divide-y divide-border">
            {sorted.map((result) => (
              <li key={result.inputUrl} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {result.alumniIds[0] ? (
                    <Link
                      href={`/profile/${result.alumniIds[0]}`}
                      className="rounded text-foreground hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {result.name}
                    </Link>
                  ) : (
                    <span>{result.name}</span>
                  )}
                  <span
                    className={
                      result.status === "updated"
                        ? "text-xs text-emerald-400"
                        : "text-xs text-text-secondary"
                    }
                  >
                    {result.status === "updated"
                      ? "Updated"
                      : result.status === "write_failed"
                        ? "Write failed"
                        : result.status === "unmatched"
                          ? "Unmatched URL"
                          : "Unavailable"}{" "}
                    ·{" "}
                    {result.source === "browser"
                      ? "Signed-in LinkedIn"
                      : result.source === "recovery"
                        ? "Recovery provider"
                        : "Primary provider"}
                  </span>
                </div>
                <p className="break-all text-xs text-text-muted">
                  {result.inputUrl}
                </p>
                <p className="text-xs text-text-secondary">
                  {result.status === "updated"
                    ? result.fields
                        .map((field) => FIELD_LABELS[field] || field)
                        .join(", ")
                    : result.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
