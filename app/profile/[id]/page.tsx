import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

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

  // Security: only allow viewing opted-in profiles (or your own)
  const isOwnProfile = alumni.auth_id === user.id;
  if (!isOwnProfile && alumni.opt_status !== "opted_in") notFound();

  const canSeeEmail = viewerOptedIn && alumni.opt_status === "opted_in";
  const rawLinkedIn = alumni.linkedin_url?.trim() || "";
  const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\//i;
  const normalizedLinkedIn = rawLinkedIn.startsWith("http") ? rawLinkedIn : `https://${rawLinkedIn}`;
  const linkedInUrl = rawLinkedIn && linkedInRegex.test(normalizedLinkedIn) ? normalizedLinkedIn : "";
  const hasLinkedIn = !!linkedInUrl;

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/directory"
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors mb-8"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Directory
          </Link>

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
                    Class of {alumni.graduation_year}
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
            <div className="space-y-3">
              {/* LinkedIn — always visible */}
              {hasLinkedIn && (
                <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    View LinkedIn Profile
                    {alumni.opt_status !== "opted_in" && (
                      <span className="text-xs opacity-70 font-normal ml-1">(public)</span>
                    )}
                  </Button>
                </a>
              )}

              {/* Email — only if mutual opt-in */}
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

              {/* No contact at all */}
              {!hasLinkedIn && !canSeeEmail && (
                <div className="p-4 rounded-lg bg-surface border border-border">
                  <p className="text-sm text-text-secondary">
                    {!viewerOptedIn
                      ? "Opt in to see email contact details for opted-in alumni."
                      : "This alumni hasn't shared contact info yet."}
                  </p>
                  {!viewerOptedIn && (
                    <Link href="/settings" className="text-sm text-accent hover:text-accent-light mt-2 inline-block">
                      Go to settings to opt in →
                    </Link>
                  )}
                </div>
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
