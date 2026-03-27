"use client";

import Toggle from "@/components/ui/Toggle";
import Badge from "@/components/ui/Badge";
import type { OptStatus, ContactPreference } from "@/lib/types";

interface StepOptInProps {
  data: {
    opt_status: OptStatus;
    preferred_contact: ContactPreference;
    linkedin_url: string;
    contact_email: string;
  };
  onChange: (field: string, value: string) => void;
}

const CONTACT_OPTIONS: { value: ContactPreference; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

export default function StepOptIn({ data, onChange }: StepOptInProps) {
  const isOptedIn = data.opt_status === "opted_in";
  const hasLinkedIn = !!data.linkedin_url?.trim();
  const hasEmail = !!data.contact_email?.trim();

  const handleContactSelect = (value: ContactPreference) => {
    if (value === "email" && !hasEmail) return;
    if (value === "linkedin" && !hasLinkedIn) return;
    if (value === "both" && (!hasLinkedIn || !hasEmail)) return;
    onChange("preferred_contact", value);
  };

  const getDisabledReason = (value: ContactPreference): string | null => {
    if (value === "email" && !hasEmail) return "Add a contact email in the previous step";
    if (value === "linkedin" && !hasLinkedIn) return "Add a LinkedIn URL in the previous step";
    if (value === "both" && !hasLinkedIn) return "Add a LinkedIn URL in the previous step";
    if (value === "both" && !hasEmail) return "Add a contact email in the previous step";
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
          Ready to go live?
        </h2>
        <p className="mt-2 text-text-secondary leading-relaxed">
          To access the alumni directory and connect with other alumni, you need
          to opt in yourself. It&apos;s only fair — everyone who benefits also
          contributes.
        </p>
      </div>

      <div className="p-6 rounded-xl bg-surface border border-border space-y-4">
        <Toggle
          checked={isOptedIn}
          onChange={(checked) =>
            onChange("opt_status", checked ? "opted_in" : "opted_out")
          }
          label="Join the alumni network"
          description="Make your profile visible and get access to other alumni's contact info."
        />

        <div className="pl-16 space-y-2">
          <p className="text-xs text-text-muted leading-relaxed">
            {isOptedIn ? (
              <>
                Other TSE members and alumni can see your name, role, company,
                and preferred contact method. You&apos;ll also be able to see
                theirs.
              </>
            ) : (
              <>
                If you opt out, your name will still appear in the directory but
                your contact info will be hidden. You also won&apos;t be able to
                see other alumni&apos;s contact details.
              </>
            )}
          </p>
          <p className="text-xs text-text-muted">
            You can change this anytime from your settings.
          </p>
        </div>
      </div>

      {isOptedIn && (
        <div className="p-6 rounded-xl bg-surface border border-border space-y-3">
          <label className="text-sm font-medium text-text-secondary">
            Preferred Contact Method
          </label>
          <p className="text-xs text-text-muted">
            How would you like people to reach you?
          </p>
          <div className="flex gap-2">
            {CONTACT_OPTIONS.map((option) => {
              const disabled = !!getDisabledReason(option.value);
              return (
                <Badge
                  key={option.value}
                  interactive
                  active={data.preferred_contact === option.value}
                  onClick={() => handleContactSelect(option.value)}
                  className={disabled ? "opacity-40 cursor-not-allowed" : ""}
                >
                  {option.label}
                </Badge>
              );
            })}
          </div>
          {CONTACT_OPTIONS.map((option) => {
            const reason = getDisabledReason(option.value);
            if (reason && data.preferred_contact === option.value) {
              return (
                <p key={option.value} className="text-xs text-yellow-400">
                  {reason}
                </p>
              );
            }
            return null;
          })}
          {!hasLinkedIn && !hasEmail && (
            <p className="text-xs text-yellow-400">
              Add a LinkedIn URL or contact email in the previous step to set your preferred contact method.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
