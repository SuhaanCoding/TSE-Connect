"use client";

import { useState } from "react";
import { cn, getInitials, getAvatarColor } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Avatar({
  name,
  src,
  size = "md",
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const safeName = name || "?";

  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg",
  };

  // Only render img if src is a valid http(s) URL and hasn't errored
  const showImg = src && !imgError && /^https?:\/\//.test(src);

  if (showImg) {
    return (
      <img
        src={src!}
        alt=""
        onError={() => setImgError(true)}
        className={cn(
          "rounded-full object-cover shrink-0",
          sizes[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white shrink-0",
        sizes[size],
        className
      )}
      style={{ backgroundColor: getAvatarColor(safeName) }}
      aria-label={safeName}
    >
      {getInitials(safeName)}
    </div>
  );
}
