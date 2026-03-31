import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import BackButton from "@/components/ui/BackButton";

interface ProfileDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfileDetailPage({
  params,
}: ProfileDetailPageProps) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  const isOwnProfile = alumni.auth_id === user.id;

  const canSeeEmail = viewerOptedIn && alumni.opt_status === "opted_in";
  const rawLinkedIn = alumni.linkedin_url?.trim() || "";
  const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\//i;
  const normalizedLinkedIn = rawLinkedIn.startsWith("http") ? rawLinkedIn : `https://${rawLinkedIn}`;
  const linkedInUrl = rawLinkedIn && linkedInRegex.test(normalizedLinkedIn) ? normalizedLinkedIn : "";
  const hasLinkedIn = !!linkedInUrl;
  const hasEmail = !!alumni.contact_email;
  const profileHasContact = hasLinkedIn || hasEmail;

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
                    {alumni.graduation_year.toLowerCase() === "currently in school"
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
                  <div className="flex items-center gap-3">
                    {hasLinkedIn && (
                      <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="primary">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                          </svg>
                          View LinkedIn Profile
                        </Button>
                      </a>
                    )}
                    {canSeeEmail && alumni.contact_email && (
                      <a href={`mailto:${alumni.contact_email}`}>
                        <Button variant="secondary">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          Send Email
                        </Button>
                      </a>
                    )}
                  </div>
                  {!hasLinkedIn && !canSeeEmail && (
                    <p className="text-sm text-text-muted">This alumni hasn&apos;t shared contact info yet.</p>
                  )}
                </>
              ) : (
                /* Not opted in — show blurred ghost with opt-in CTA */
                <Link href="/settings" className="relative block group">
                  <div className="flex items-center gap-3 blur-[6px] pointer-events-none select-none" aria-hidden="true">
                    {hasLinkedIn && (
                      <div>
                        <Button variant="primary">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                          </svg>
                          View LinkedIn Profile
                        </Button>
                      </div>
                    )}
                    {hasEmail && (
                      <div>
                        <Button variant="secondary">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          Send Email
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-medium text-accent group-hover:text-accent-light transition-colors">
                      Opt in to see contact info →
                    </span>
                  </div>
                </Link>
              )}
            </div>

            {/* Past Companies */}
            {alumni.past_companies && alumni.past_companies.length > 0 && (
              <div>
                <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wider mb-3">
                  Past Companies
                </h2>
                <div className="flex flex-wrap gap-2">
                  {alumni.past_companies.map((company: string) => (
                    <Badge key={company} variant="neutral" className="px-3 py-1.5">
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
