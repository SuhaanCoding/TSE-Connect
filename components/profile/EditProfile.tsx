"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Toggle from "@/components/ui/Toggle";
import Toast from "@/components/ui/Toast";
import Avatar from "@/components/ui/Avatar";
import {
  GRADUATION_YEARS,
  type Alumni,
  type ContactPreference,
} from "@/lib/types";

interface EditProfileProps {
  alumni: Alumni;
}

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+/i.test(url) || /^[\w.-]+\.[\w.-]+/i.test(url);
}

export default function EditProfile({ alumni }: EditProfileProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const submittingRef = useRef(false);
  const [formData, setFormData] = useState({
    full_name: alumni.full_name || "",
    graduation_year: alumni.graduation_year || "",
    current_role: alumni.current_role || "",
    current_company: alumni.current_company || "",
    linkedin_url: alumni.linkedin_url || "",
    contact_email: alumni.contact_email || "",
    preferred_contact: (alumni.preferred_contact || "linkedin") as ContactPreference,
    opt_status: alumni.opt_status || "not_confirmed",
  });

  const handleChange = (field: string, value: string | string[] | boolean) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      // Auto-correct preferred_contact when contact fields change or opt-in toggles
      if (field === "linkedin_url" || field === "contact_email" || field === "opt_status") {
        const hasLinkedIn = !!(field === "linkedin_url" ? (value as string).trim() : next.linkedin_url.trim());
        const hasEmail = !!(field === "contact_email" ? (value as string).trim() : next.contact_email.trim());

        // When toggling opt-in ON, auto-compute default
        if (field === "opt_status" && value === "opted_in") {
          if (hasLinkedIn && hasEmail) next.preferred_contact = "both";
          else if (hasEmail) next.preferred_contact = "email";
          else next.preferred_contact = "linkedin";
        }

        // If current preference is invalid for available fields, fix it
        if (next.preferred_contact === "both" && (!hasLinkedIn || !hasEmail)) {
          next.preferred_contact = hasEmail ? "email" : "linkedin";
        } else if (next.preferred_contact === "email" && !hasEmail) {
          next.preferred_contact = "linkedin";
        } else if (next.preferred_contact === "linkedin" && !hasLinkedIn && hasEmail) {
          next.preferred_contact = "email";
        }
      }

      return next;
    });
  };

  const handleContactSelect = (value: ContactPreference) => {
    const hasLinkedIn = !!formData.linkedin_url.trim();
    const hasEmail = !!formData.contact_email.trim();
    if (value === "email" && !hasEmail) return;
    if (value === "linkedin" && !hasLinkedIn) return;
    if (value === "both" && (!hasLinkedIn || !hasEmail)) return;
    setFormData((prev) => ({ ...prev, preferred_contact: value }));
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;

    // Validate
    if (!formData.full_name.trim()) {
      setToast({ message: "Full name is required", type: "error" });
      return;
    }
    if (formData.linkedin_url && !isValidUrl(formData.linkedin_url)) {
      setToast({ message: "Please enter a valid LinkedIn URL", type: "error" });
      return;
    }
    if (formData.contact_email && !isValidEmail(formData.contact_email)) {
      setToast({ message: "Please enter a valid email address", type: "error" });
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/alumni", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setToast({ message: "Profile updated successfully", type: "success" });
        router.refresh();
      } else if (res.status === 401) {
        setToast({ message: "Session expired. Please sign in again.", type: "error" });
        setTimeout(() => router.push("/"), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ message: data.error || "Failed to update profile", type: "error" });
      }
    } catch {
      setToast({ message: "Network error. Please try again.", type: "error" });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={toast.type === "error" ? 5000 : 3000}
        />
      )}

      <div className="space-y-8">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <Avatar name={formData.full_name} src={alumni.avatar_url} size="lg" />
          <div>
            <p className="font-heading font-semibold">{formData.full_name || "Your Name"}</p>
            <p className="text-sm text-text-muted">{alumni.login_email}</p>
          </div>
        </div>

        {/* Basic Info */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-lg border-b border-border pb-2">
            Basic Info
          </h2>
          <Input
            id="full_name"
            label="Full Name"
            value={formData.full_name}
            onChange={(e) => handleChange("full_name", e.target.value)}
            error={!formData.full_name.trim() ? "Required" : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="graduation_year" className="text-sm font-medium text-text-secondary">
              Graduation Year
            </label>
            <select
              id="graduation_year"
              value={formData.graduation_year}
              onChange={(e) => handleChange("graduation_year", e.target.value)}
              className="w-full rounded-lg bg-[#141416] border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Select year</option>
              {GRADUATION_YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <Input
            id="current_role"
            label="Current Role"
            value={formData.current_role}
            onChange={(e) => handleChange("current_role", e.target.value)}
          />
          <Input
            id="current_company"
            label="Current Company"
            value={formData.current_company}
            onChange={(e) => handleChange("current_company", e.target.value)}
          />
        </section>

        {/* Contact */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-lg border-b border-border pb-2">
            Contact
          </h2>
          <Input
            id="linkedin_url"
            label="LinkedIn URL"
            value={formData.linkedin_url}
            onChange={(e) => handleChange("linkedin_url", e.target.value)}
            error={formData.linkedin_url && !isValidUrl(formData.linkedin_url) ? "Invalid URL" : undefined}
          />
          <Input
            id="contact_email"
            label="Contact Email"
            type="email"
            value={formData.contact_email}
            onChange={(e) => handleChange("contact_email", e.target.value)}
            error={formData.contact_email && !isValidEmail(formData.contact_email) ? "Invalid email" : undefined}
          />
          {formData.opt_status === "opted_in" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-secondary">
                Preferred Contact Method
              </label>
              <div className="flex gap-2">
                {(["linkedin", "email", "both"] as const).map((option) => {
                  const hasLinkedIn = !!formData.linkedin_url.trim();
                  const hasEmail = !!formData.contact_email.trim();
                  const disabled =
                    (option === "email" && !hasEmail) ||
                    (option === "linkedin" && !hasLinkedIn) ||
                    (option === "both" && (!hasLinkedIn || !hasEmail));
                  return (
                    <Badge
                      key={option}
                      interactive
                      active={formData.preferred_contact === option}
                      onClick={() => handleContactSelect(option)}
                      className={disabled ? "opacity-40 cursor-not-allowed" : ""}
                    >
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Badge>
                  );
                })}
              </div>
              {!formData.linkedin_url.trim() && !formData.contact_email.trim() && (
                <p className="text-xs text-yellow-400">
                  Add a LinkedIn URL or contact email to set your preferred contact method.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Visibility */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-lg border-b border-border pb-2">
            Visibility
          </h2>
          <Toggle
            checked={formData.opt_status === "opted_in"}
            onChange={(checked) =>
              handleChange("opt_status", checked ? "opted_in" : "opted_out")
            }
            label="Join the alumni network"
            description="Make your profile visible and get access to other alumni's contact info. Opting out means you can't see others' contact details either."
          />
        </section>

        {/* Save */}
        <div className="pt-4">
          <Button onClick={handleSubmit} loading={loading} disabled={loading}>
            Save Changes
          </Button>
        </div>
      </div>
    </>
  );
}
