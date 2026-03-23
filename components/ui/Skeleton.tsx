import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-[rgba(250,250,248,0.06)] animate-shimmer bg-[length:400%_100%]",
        "bg-gradient-to-r from-[rgba(250,250,248,0.06)] via-[rgba(250,250,248,0.1)] to-[rgba(250,250,248,0.06)]",
        className
      )}
    />
  );
}
