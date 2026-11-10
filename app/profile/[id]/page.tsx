import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ButtonLink from "@/components/ui/ButtonLink";
import BackButton from "@/components/ui/BackButton";
import KeywordTags from "@/components/profile/KeywordTags";

interface ProfileDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfileDetailPage({
  params,
}: ProfileDetailPageProps) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Fetch viewer's opt_status
  const { data: viewer } = await supabase
    .from("alumni")
    .select("opt_status")
    .eq("auth_id", user.id)
    .maybeSingle();

  const viewerOptedIn = viewer?.opt_status === "opted_in";

  const { data: alumni } = await supabase
    .from("alumni")
    .select("*")
    .eq("id", id)
    .single();

  if (!alumni) notFound();

  const canSeeEmail = viewerOptedIn && alumni.opt_status === "opted_in";
  const rawLinkedIn = alumni.linkedin_url?.trim() || "";
  const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\//i;
  const normalizedLinkedIn = rawLinkedIn.startsWith("http")
    ? rawLinkedIn
    : `https://${rawLinkedIn}`;
  const linkedInUrl =
    rawLinkedIn && linkedInRegex.test(normalizedLinkedIn)
      ? normalizedLinkedIn
      : "";
  const hasLinkedIn = !!linkedInUrl;

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <BackButton
            label="Back to Directory"
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors mb-8"
          />

          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start gap-5">
              <Avatar
                name={alumni.full_name}
                src={alumni.avatar_url}
                size="lg"
              />
              <div className="flex-1">
                <h1 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
                  {alumni.full_name}
                </h1>
                {(alumni.current_role || alumni.current_company) && (
                  <p className="mt-1 text-text-secondary">
                    {alumni.current_role}
                    {alumni.current_role && alumni.current_company && " @ "}
                    {alumni.current_company}
                  </p>
                )}
                {alumni.graduation_year && (
                  <p className="mt-1 text-sm text-text-muted">
                    {alumni.graduation_year.toLowerCase() ===
                    "currently in school"
                      ? "Currently in school"
                      : `Class of ${alumni.graduation_year}`}
                  </p>
                )}
                {alumni.tse_role && (
                  <p className="mt-0.5 text-sm text-text-muted">
                    TSE: {alumni.tse_role}
                  </p>
                )}
              </div>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-3">
              {viewerOptedIn && (
                <p className="text-xs text-text-muted">
                  {alumni.opt_status === "opted_in" ? (
                    <>
                      Prefers contact via{" "}
                      <span className="text-text-secondary font-medium">
                        {alumni.preferred_contact === "both"
                          ? "LinkedIn or Email"
                          : alumni.preferred_contact === "email"
                            ? "Email"
                            : "LinkedIn"}
                      </span>
                    </>
                  ) : (
                    <span className="text-text-muted">Public profile</span>
                  )}
                </p>
              )}
              {viewerOptedIn ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {hasLinkedIn && (
                      <ButtonLink
                        href={linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                        View LinkedIn Profile
                      </ButtonLink>
                    )}
                    {canSeeEmail && alumni.contact_email && (
                      <ButtonLink
                        href={`mailto:${alumni.contact_email}`}
                        variant="secondary"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                          />
                        </svg>
                        Send Email
                      </ButtonLink>
                    )}
                  </div>
                  {!hasLinkedIn && !(canSeeEmail && alumni.contact_email) && (
                    <p className="text-sm text-text-muted">
                      This alumni hasn&apos;t shared contact info yet.
                    </p>
                  )}
                </>
              ) : (
                <Link
                  href="/settings"
                  className="inline-flex w-fit rounded-lg border border-border-hover px-5 py-2.5 text-sm font-medium text-accent hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Opt in to see contact info →
                </Link>
              )}
            </div>

            {alumni.bio && (
              <section aria-labelledby="profile-bio-heading">
                <h2
                  id="profile-bio-heading"
                  className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wider mb-3"
                >
                  About
                </h2>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
                  {alumni.bio}
                </p>
              </section>
            )}

            {alumni.keywords?.length > 0 && (
              <section aria-labelledby="profile-keywords-heading">
                <h2
                  id="profile-keywords-heading"
                  className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wider mb-3"
                >
                  Interests & Expertise
                </h2>
                <KeywordTags keywords={alumni.keywords} />
              </section>
            )}

            {(alumni.linkedin_about || alumni.linkedin_background) && (
              <details className="group rounded-xl border border-border bg-surface p-5">
                <summary className="cursor-pointer rounded text-sm font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  LinkedIn background
                </summary>
                <p className="mt-2 text-xs text-text-muted">
                  Public About, experience, and project descriptions from the
                  latest LinkedIn refresh. Some details may be hidden on
                  LinkedIn.
                </p>
                {alumni.linkedin_about && (
                  <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
                    {alumni.linkedin_about}
                  </p>
                )}
                {alumni.linkedin_background && (
                  <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
                    {alumni.linkedin_background}
                  </p>
                )}
              </details>
            )}

            {/* Past Companies */}
            {alumni.past_companies && alumni.past_companies.length > 0 && (
              <div>
                <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wider mb-3">
                  Past Companies
                </h2>
                <div className="flex flex-wrap gap-2">
                  {alumni.past_companies.map((company: string) => (
                    <Badge
                      key={company}
                      variant="neutral"
                      className="px-3 py-1.5"
                    >
                      {company}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
