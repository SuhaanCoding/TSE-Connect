"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import StepIndicator from "./StepIndicator";
import StepIdentity from "./StepIdentity";
import StepVerify from "./StepVerify";
import StepContact from "./StepContact";
import StepOptIn from "./StepOptIn";
import type { Alumni, OnboardingStep, ContactPreference, OptStatus } from "@/lib/types";

interface OnboardingFormData {
  full_name: string;
  graduation_year: string;
  current_role: string;
  current_company: string;
  linkedin_url: string;
  contact_email: string;
  preferred_contact: ContactPreference;
  opt_status: OptStatus;
}

interface OnboardingFlowProps {
  alumni: Alumni | null;
  googleName: string;
  loginEmail: string;
  isReturning: boolean;
}

export default function OnboardingFlow({
  alumni,
  googleName,
  loginEmail,
  isReturning,
}: OnboardingFlowProps) {
  const router = useRouter();
  const initialStep: OnboardingStep = alumni ? 2 : 1;
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedAlumni, setClaimedAlumni] = useState<Alumni | null>(alumni);
  const submittingRef = useRef(false); // Prevent double-submit
  const [formData, setFormData] = useState<OnboardingFormData>({
    full_name: alumni?.full_name || "",
    graduation_year: alumni?.graduation_year || "",
    current_role: alumni?.current_role || "",
    current_company: alumni?.current_company || "",
    linkedin_url: alumni?.linkedin_url || "",
    contact_email: alumni?.contact_email || loginEmail || "",
    preferred_contact: alumni?.preferred_contact || "linkedin",
    opt_status: alumni?.opt_status || "not_confirmed",
  });

  const prefilled = !!(claimedAlumni?.current_role || claimedAlumni?.current_company);

  const handleChange = useCallback(
    (field: string, value: string | string[] | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleClaim = async (alumniId: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/alumni/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumni_id: alumniId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to claim profile. Please try again.");
        return false;
      }

      const { data } = await res.json();
      setClaimedAlumni(data);

      setFormData((prev) => ({
        ...prev,
        full_name: data.full_name || prev.full_name,
        graduation_year: data.graduation_year || prev.graduation_year,
        current_role: data.current_role || prev.current_role,
        current_company: data.current_company || prev.current_company,
        linkedin_url: data.linkedin_url || prev.linkedin_url,
        contact_email: data.contact_email || loginEmail || prev.contact_email,
      }));

      setStep(2);
      return true;
    } catch {
      setError("Network error. Please check your connection and try again.");
      return false;
    }
  };

  const handleSubmit = async () => {
    // Prevent double-submit
    if (submittingRef.current) return;
    submittingRef.current = true;

    // Validate required fields
    if (!formData.full_name.trim()) {
      setError("Full name is required.");
      submittingRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alumni", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        router.push("/directory?welcome=true");
      } else if (res.status === 401) {
        // Session expired
        setError("Your session expired. Please sign in again.");
        setTimeout(() => router.push("/"), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save your profile. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return false; // Identity step handles its own navigation
      case 2:
        return formData.full_name.trim().length > 0;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return true;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-8">
        {error && (
          <Toast message={error} type="error" onClose={() => setError(null)} duration={5000} />
        )}

        {/* Header for returning users */}
        {isReturning && step === 2 && (
          <div className="flex items-center justify-between">
            <h1 className="font-heading font-bold text-xl text-text-secondary">
              Review your settings
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/directory")}
            >
              Back to Directory
            </Button>
          </div>
        )}

        <StepIndicator currentStep={step} totalSteps={alumni ? 3 : 4} />

        {step === 1 && (
          <StepIdentity googleName={googleName} onClaim={handleClaim} />
        )}
        {step === 2 && (
          <StepVerify
            data={formData}
            onChange={handleChange}
            prefilled={prefilled}
          />
        )}
        {step === 3 && (
          <StepContact
            data={formData}
            onChange={handleChange}
            loginEmail={loginEmail}
          />
        )}
        {step === 4 && <StepOptIn data={formData} onChange={handleChange} />}

        {/* Navigation */}
        {step > 1 && (
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                if (isReturning && step === 2) {
                  router.push("/directory");
                } else if (step === 2 && claimedAlumni) {
                  // Don't allow going back to identity if already claimed
                  // (prevents re-claiming a different profile mid-onboarding)
                  return;
                } else {
                  setStep((s) => (s - 1) as OnboardingStep);
                }
              }}
              disabled={step === 2 && !!claimedAlumni && !isReturning}
            >
              {isReturning && step === 2 ? "Back to Directory" : "Back"}
            </Button>

            {step < 4 ? (
              <Button
                onClick={() => {
                  const nextStep = (step + 1) as OnboardingStep;
                  // When entering opt-in step, default to "opted_out" if still "not_confirmed"
                  if (nextStep === 4 && formData.opt_status === "not_confirmed") {
                    setFormData((prev) => ({ ...prev, opt_status: "opted_out" }));
                  }
                  setStep(nextStep);
                }}
                disabled={!canProceed()}
              >
                Continue
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={loading} disabled={loading}>
                {isReturning ? "Save Changes" : "Complete Setup"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
