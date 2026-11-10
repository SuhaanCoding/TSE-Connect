import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonBase, buttonVariants, buttonSizes } from "./buttonStyles";

export default function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <Link
      className={cn(
        buttonBase,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}
