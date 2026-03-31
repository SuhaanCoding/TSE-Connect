"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ label = "Back", className }: { label?: string; className?: string }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className={className}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      {label}
    </button>
  );
}
