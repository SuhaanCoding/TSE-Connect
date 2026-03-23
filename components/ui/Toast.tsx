"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  duration?: number;
  onClose: () => void;
}

export default function Toast({
  message,
  type = "success",
  duration = 3000,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    const timer = setTimeout(onClose, 200);
    return () => clearTimeout(timer);
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  return (
    <div
      className={cn(
        "fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-lg shadow-lg border transition-all duration-200 max-w-md",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2",
        type === "success"
          ? "bg-surface border-accent/20 text-foreground"
          : "bg-surface border-red-500/20 text-foreground"
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-2">
        {type === "success" ? (
          <svg
            className="h-4 w-4 text-accent shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 text-red-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
        <span className="text-sm font-medium flex-1">{message}</span>
        <button
          onClick={dismiss}
          className="text-text-muted hover:text-foreground shrink-0 cursor-pointer"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
