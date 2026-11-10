"use client";

import { useRef } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onCompositionChange?: (isComposing: boolean) => void;
}

export default function SearchBar({
  value,
  onChange,
  onCompositionChange,
}: SearchBarProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        ref={input}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => onCompositionChange?.(true)}
        onCompositionEnd={() => onCompositionChange?.(false)}
        aria-label="Search alumni by name, company, role, bio, or keyword"
        placeholder="Search people, companies, interests, or expertise..."
        className="w-full rounded-xl bg-surface border border-border pl-12 pr-10 py-3.5 text-sm text-foreground placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        maxLength={200}
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-foreground transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Clear search"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
