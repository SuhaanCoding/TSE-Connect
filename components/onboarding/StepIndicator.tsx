import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/types";

interface StepIndicatorProps {
  currentStep: OnboardingStep;
  totalSteps: number;
}

export default function StepIndicator({
  currentStep,
  totalSteps,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = (i + 1) as OnboardingStep;
        const isComplete = step < currentStep;
        const isCurrent = step === currentStep;

        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                isCurrent
                  ? "w-8 bg-accent"
                  : isComplete
                    ? "w-2 bg-accent"
                    : "w-2 bg-[rgba(250,250,248,0.15)]"
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
