import Link from "next/link";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import MobileMenu from "./MobileMenu";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let alumniName: string | null = null;
  let showAdmin = false;
  let isOnboarded = false;

  if (user) {
    const { data: alumni } = await supabase
      .from("alumni")
      .select("full_name, opt_status")
      .eq("auth_id", user.id)
      .maybeSingle();

    alumniName = alumni?.full_name ?? user.user_metadata?.full_name ?? null;
    isOnboarded = !!(alumni && alumni.opt_status !== "not_confirmed");

    if (user.email) {
      showAdmin = await isAdmin(user.email);
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
            {/* Desktop nav */}
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

            {/* Mobile nav */}
            <div className="md:hidden">
              <MobileMenu links={links} userName={alumniName || "User"} />
            </div>
          </>
        ) : (
          <form action="/auth/sign-in" method="POST">
            <Button size="sm" variant="secondary" type="submit">
              Sign In
            </Button>
          </form>
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
