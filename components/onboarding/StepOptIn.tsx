"use client";

import Toggle from "@/components/ui/Toggle";
import type { OptStatus } from "@/lib/types";

interface StepOptInProps {
  data: {
    opt_status: OptStatus;
  };
  onChange: (field: string, value: string) => void;
}

export default function StepOptIn({ data, onChange }: StepOptInProps) {
  const isOptedIn = data.opt_status === "opted_in";

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
            You can change this anytime from your profile.
          </p>
        </div>
      </div>
    </div>
  );
}
