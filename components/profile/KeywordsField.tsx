"use client";

import { useRef } from "react";
import Input from "@/components/ui/Input";
import {
  keywordsFromText,
  MAX_KEYWORDS,
  validateKeywords,
} from "@/lib/profile";
import KeywordTags from "./KeywordTags";

export default function KeywordsField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const keywords = keywordsFromText(value);
  const error = validateKeywords(keywords);
  return (
    <div className="space-y-3">
      <Input
        ref={input}
        id="keywords"
        label="Keywords (optional)"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g., Climate tech, Product design, Mentorship"
        maxLength={1000}
        aria-describedby={`keywords-help${error ? " keywords-error" : ""}`}
        aria-invalid={!!error}
      />
      <div className="flex items-start justify-between gap-4 text-xs text-text-muted">
        <p id="keywords-help">
          Separate with commas. Shown on your profile and searchable by
          signed-in TSE members.
        </p>
        <span className="shrink-0 tabular-nums">
          {keywords.length}/{MAX_KEYWORDS}
        </span>
      </div>
      {error && (
        <p id="keywords-error" role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <KeywordTags keywords={keywords.slice(0, MAX_KEYWORDS)} compact />
    </div>
  );
}
