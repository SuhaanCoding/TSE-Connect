"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}

export default function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: ToggleProps) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-accent" : "bg-[rgba(250,250,248,0.15)]"
        )}
        type="button"
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <span className="text-sm font-medium text-foreground">
              {label}
            </span>
          )}
          {description && (
            <span className="text-sm text-text-muted">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}
