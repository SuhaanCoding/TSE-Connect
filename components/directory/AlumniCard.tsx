"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import type { Alumni, OptStatus } from "@/lib/types";

interface AlumniWithMatch extends Alumni {
  match_type?: "current" | "past" | null;
}

interface AlumniCardProps {
  alumni: AlumniWithMatch;
  index: number;
  viewerOptedIn: boolean;
  companyFilter?: string[];
}

function StatusBadge({ status }: { status: OptStatus }) {
  // Only show meaningful status — skip "not_confirmed" (it's the default for 99% of users)
  if (status === "not_confirmed") return null;

  const config = {
    opted_in: { label: "Opted In", className: "bg-emerald-500/15 text-emerald-400" },
    opted_out: { label: "Opted Out", className: "bg-red-500/15 text-red-400" },
    not_confirmed: { label: "", className: "" },
  };

  const { label, className } = config[status];
  if (!label) return null;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

export default function AlumniCard({
  alumni,
  index,
  viewerOptedIn,
  companyFilter = [],
}: AlumniCardProps) {
  const canSeeEmail = viewerOptedIn && alumni.opt_status === "opted_in";
  const rawLinkedIn = alumni.linkedin_url?.trim() || "";
  const linkedInUrl = rawLinkedIn
    ? rawLinkedIn.startsWith("http") ? rawLinkedIn : `https://${rawLinkedIn}`
    : "";
  const hasLinkedIn = !!linkedInUrl;

  const fullRole = [alumni.current_role, alumni.current_company]
    .filter(Boolean)
    .join(" @ ");

  return (
    <Card
      hoverable
      className="animate-fade-in-up group h-full flex flex-col"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link href={`/profile/${alumni.id}`} className="block space-y-3 flex-1">
        <div className="flex items-start gap-3">
          <Avatar
            name={alumni.full_name}
            src={alumni.avatar_url}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <h3
              className="font-heading font-semibold text-sm truncate"
              title={alumni.full_name}
            >
              {alumni.full_name}
            </h3>
            {fullRole && (
              <p
                className="text-xs text-text-secondary truncate mt-0.5"
                title={fullRole}
              >
                {fullRole}
              </p>
            )}
            {/* Company match indicator */}
            {companyFilter.length > 0 && alumni.match_type === "current" && (
              <span className="inline-flex items-center text-[10px] font-medium text-emerald-400 mt-0.5">
                Current employee
              </span>
            )}
            {companyFilter.length > 0 && alumni.match_type === "past" && (
              <span className="inline-flex items-center text-[10px] font-medium text-yellow-400 mt-0.5">
                Previously at {companyFilter.join(", ")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={alumni.opt_status} />
          {alumni.graduation_year && (
            <Badge variant="neutral" className="text-[11px]">
              {alumni.graduation_year}
            </Badge>
          )}
        </div>
      </Link>

      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
        {/* LinkedIn — always visible if available */}
        {hasLinkedIn && (
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-light transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            LinkedIn
          </a>
        )}

        {/* Email contact — only if mutual opt-in */}
        {canSeeEmail && alumni.contact_email && (
          <a
            href={`mailto:${alumni.contact_email}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-light transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Email
          </a>
        )}

        {/* Actionable opt-in prompt */}
        {!hasLinkedIn && !canSeeEmail && (
          <Link
            href="/settings"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent hover:text-accent-light transition-colors"
          >
            {!viewerOptedIn
              ? "Opt in to see contact info →"
              : "No contact info available"}
          </Link>
        )}
      </div>
    </Card>
  );
}
