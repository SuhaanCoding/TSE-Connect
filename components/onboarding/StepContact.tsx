"use client";

import Input from "@/components/ui/Input";

interface StepContactProps {
  data: {
    linkedin_url: string;
    contact_email: string;
  };
  onChange: (field: string, value: string) => void;
  loginEmail: string;
}

function isValidUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+/i.test(url) || /^[\w.-]+\.[\w.-]+/i.test(url);
}

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function StepContact({
  data,
  onChange,
  loginEmail,
}: StepContactProps) {
  const linkedinError = data.linkedin_url && !isValidUrl(data.linkedin_url)
    ? "Please enter a valid LinkedIn URL"
    : undefined;

  const emailError = data.contact_email && !isValidEmail(data.contact_email)
    ? "Please enter a valid email address"
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
          How should people reach you?
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Add your contact info so alumni and members can get in touch.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          id="linkedin_url"
          label="LinkedIn URL"
          value={data.linkedin_url}
          onChange={(e) => onChange("linkedin_url", e.target.value)}
          placeholder="https://linkedin.com/in/yourprofile"
          error={linkedinError}
        />

        <div>
          <Input
            id="contact_email"
            label="Contact Email"
            type="email"
            value={data.contact_email}
            onChange={(e) => onChange("contact_email", e.target.value)}
            placeholder="you@example.com"
            error={emailError}
          />
          {data.contact_email === loginEmail && (
            <p className="mt-1 text-xs text-text-muted">
              This defaults to your Google login email. Change it if you prefer
              to be reached at a different address.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
