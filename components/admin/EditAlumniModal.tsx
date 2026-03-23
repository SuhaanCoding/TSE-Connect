"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { type Alumni, type OptStatus, type ContactPreference } from "@/lib/types";

interface EditAlumniModalProps {
  alumni: Alumni;
  onSave: (data: Partial<Alumni> & { id: string }) => Promise<void>;
  onClose: () => void;
}

export default function EditAlumniModal({
  alumni,
  onSave,
  onClose,
}: EditAlumniModalProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: alumni.full_name || "",
    graduation_year: alumni.graduation_year || "",
    current_role: alumni.current_role || "",
    current_company: alumni.current_company || "",
    linkedin_url: alumni.linkedin_url || "",
    contact_email: alumni.contact_email || "",
    preferred_contact: (alumni.preferred_contact || "linkedin") as ContactPreference,
    opt_status: (alumni.opt_status || "not_confirmed") as OptStatus,
    past_companies: alumni.past_companies || [],
  });
  const [newPastCompany, setNewPastCompany] = useState("");

  const handleSave = async () => {
    setSaving(true);
    await onSave({ id: alumni.id, ...form });
    setSaving(false);
  };

  const addPastCompany = () => {
    const trimmed = newPastCompany.trim();
    if (trimmed && !form.past_companies.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setForm((f) => ({
        ...f,
        past_companies: [...f.past_companies, trimmed],
      }));
      setNewPastCompany("");
    } else if (trimmed) {
      setNewPastCompany(""); // Clear if duplicate
    }
  };

  const removePastCompany = (index: number) => {
    setForm((f) => ({
      ...f,
      past_companies: f.past_companies.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-xl">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-foreground cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Read-only metadata */}
        <div className="grid grid-cols-2 gap-3 text-xs text-text-muted bg-surface rounded-lg p-3">
          <div>
            <span className="font-medium">ID:</span> {alumni.id.slice(0, 8)}...
          </div>
          <div>
            <span className="font-medium">Auth ID:</span>{" "}
            {alumni.auth_id ? alumni.auth_id.slice(0, 8) + "..." : "None"}
          </div>
          <div>
            <span className="font-medium">Login email:</span>{" "}
            {alumni.login_email || "None"}
          </div>
          <div>
            <span className="font-medium">Updated:</span>{" "}
            {new Date(alumni.updated_at).toLocaleDateString()}
          </div>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            label="Graduation Year"
            value={form.graduation_year}
            onChange={(e) => setForm({ ...form, graduation_year: e.target.value })}
          />
          <Input
            label="Current Role"
            value={form.current_role}
            onChange={(e) => setForm({ ...form, current_role: e.target.value })}
          />
          <Input
            label="Current Company"
            value={form.current_company}
            onChange={(e) => setForm({ ...form, current_company: e.target.value })}
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="LinkedIn URL"
            value={form.linkedin_url}
            onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
          />
          <Input
            label="Contact Email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </div>

        {/* Preferred contact */}
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-2">
            Preferred Contact
          </label>
          <div className="flex gap-2">
            {(["linkedin", "email", "both"] as const).map((opt) => (
              <Badge
                key={opt}
                interactive
                active={form.preferred_contact === opt}
                onClick={() => setForm({ ...form, preferred_contact: opt })}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Badge>
            ))}
          </div>
        </div>

        {/* Opt status */}
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-2">
            Opt Status
          </label>
          <div className="flex gap-2">
            {(["opted_in", "not_confirmed", "opted_out"] as const).map((s) => (
              <Badge
                key={s}
                interactive
                active={form.opt_status === s}
                onClick={() => setForm({ ...form, opt_status: s })}
                className={
                  form.opt_status === s
                    ? s === "opted_in"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : s === "opted_out"
                        ? "bg-red-500/20 text-red-400"
                        : ""
                    : ""
                }
              >
                {s === "opted_in" ? "Opted In" : s === "opted_out" ? "Opted Out" : "Not Confirmed"}
              </Badge>
            ))}
          </div>
        </div>

        {/* Past companies */}
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-2">
            Past Companies
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.past_companies.map((company, i) => (
              <span
                key={`${company}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-surface border border-border text-xs px-2.5 py-1"
              >
                {company}
                <button
                  onClick={() => removePastCompany(i)}
                  className="text-text-muted hover:text-red-400 cursor-pointer"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg bg-[#141416] border border-border px-3 py-1.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent"
              placeholder="Add company..."
              value={newPastCompany}
              onChange={(e) => setNewPastCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPastCompany())}
            />
            <Button size="sm" variant="secondary" onClick={addPastCompany}>
              Add
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
