"use client";

import Input from "@/components/ui/Input";
import { GRADUATION_YEARS } from "@/lib/types";

interface StepVerifyProps {
  data: {
    full_name: string;
    graduation_year: string;
    current_role: string;
    current_company: string;
  };
  onChange: (field: string, value: string) => void;
  prefilled: boolean;
}

export default function StepVerify({
  data,
  onChange,
  prefilled,
}: StepVerifyProps) {
  const nameError = !data.full_name.trim()
    ? "Full name is required"
    : data.full_name.trim().length < 2
      ? "Name must be at least 2 characters"
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
          Let&apos;s make sure we&apos;ve got you right
        </h2>
        {prefilled && (
          <p className="mt-2 text-sm text-text-muted">
            We found your info from TSE records. Feel free to update anything.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <Input
          id="full_name"
          label="Full Name"
          value={data.full_name}
          onChange={(e) => onChange("full_name", e.target.value)}
          placeholder="Your full name"
          error={nameError}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="graduation_year"
            className="text-sm font-medium text-text-secondary"
          >
            Graduation Year
          </label>
          <select
            id="graduation_year"
            value={data.graduation_year}
            onChange={(e) => onChange("graduation_year", e.target.value)}
            className="w-full rounded-lg bg-[#141416] border border-border px-4 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">Select year</option>
            {GRADUATION_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <Input
          id="current_role"
          label="Current Role"
          value={data.current_role}
          onChange={(e) => onChange("current_role", e.target.value)}
          placeholder="e.g., Software Engineer"
        />

        <Input
          id="current_company"
          label="Current Company"
          value={data.current_company}
          onChange={(e) => onChange("current_company", e.target.value)}
          placeholder="e.g., Stripe"
        />
      </div>
    </div>
  );
}
