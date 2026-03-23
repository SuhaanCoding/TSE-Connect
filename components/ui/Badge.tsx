"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "accent" | "neutral";
  interactive?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function Badge({
  children,
  variant = "neutral",
  interactive = false,
  active = false,
  onClick,
  className,
}: BadgeProps) {
  const variants = {
    accent: "bg-[rgba(99,102,241,0.12)] text-accent-light",
    neutral: "bg-[rgba(250,250,248,0.06)] text-text-secondary",
  };

  const Component = interactive ? "button" : "span";

  return (
    <Component
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        interactive
          ? "cursor-pointer transition-colors duration-200"
          : "",
        active
          ? "bg-[rgba(99,102,241,0.12)] text-accent-light"
          : variants[variant],
        interactive &&
          !active &&
          "hover:bg-[rgba(250,250,248,0.1)] hover:text-foreground",
        className
      )}
      onClick={interactive ? onClick : undefined}
      type={interactive ? "button" : undefined}
    >
      {children}
    </Component>
  );
}
