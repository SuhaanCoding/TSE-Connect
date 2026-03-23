"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";

interface MobileMenuProps {
  links: { href: string; label: string }[];
  userName: string;
}

export default function MobileMenu({ links, userName }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-text-secondary hover:text-foreground cursor-pointer"
        aria-label="Menu"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-14 left-0 right-0 bg-background border-b border-border shadow-lg z-50">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-md text-sm text-text-secondary hover:text-foreground hover:bg-surface transition-colors"
              >
                {link.label}
              </Link>
            ))}

            <div className="border-t border-border pt-3 mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={userName} size="sm" />
                <span className="text-sm text-text-secondary">{userName}</span>
              </div>
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
        </div>
      )}
    </>
  );
}
