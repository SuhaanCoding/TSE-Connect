import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import SignInButton from "@/components/auth/SignInButton";
import { getCachedUser, getCachedAlumniProfile, getCachedIsAdmin } from "@/lib/supabase/cached";
import MobileMenu from "./MobileMenu";

export default async function Navbar() {
  const user = await getCachedUser();

  let alumniName: string | null = null;
  let showAdmin = false;
  let isOnboarded = false;

  if (user) {
    const alumni = await getCachedAlumniProfile(user.id);
    alumniName = alumni?.full_name ?? user.user_metadata?.full_name ?? null;
    isOnboarded = !!(alumni && alumni.opt_status !== "not_confirmed");

    if (user.email) {
      showAdmin = await getCachedIsAdmin(user.email);
    }
  }

  const links = user
    ? isOnboarded
      ? [
          { href: "/directory", label: "Directory" },
          { href: "/settings", label: "Settings" },
          ...(showAdmin ? [{ href: "/admin", label: "Admin" }] : []),
        ]
      : [{ href: "/onboarding", label: "Complete Setup" }]
    : [];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[rgba(10,10,11,0.85)] border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img src="/logo.svg" alt="" className="h-7 w-auto" />
          <span className="font-heading font-bold text-lg tracking-tight">
            TSE Connect
          </span>
        </Link>

        {user ? (
          <>
            <div className="hidden md:flex items-center gap-1">
              {links.map((link) => (
                <NavLink key={link.href} href={link.href}>
                  {link.label}
                </NavLink>
              ))}

              <div className="w-px h-5 bg-border mx-2" />

              <div className="flex items-center gap-3">
                <Avatar name={alumniName || "User"} size="sm" />
                <form action="/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="text-xs text-text-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>

            <div className="md:hidden">
              <MobileMenu links={links} userName={alumniName || "User"} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-text-muted">
              Use a personal Google account — UCSD emails expire after graduation.
            </span>
            <SignInButton />
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-foreground hover:bg-[rgba(250,250,248,0.06)] transition-all"
    >
      {children}
    </Link>
  );
}
