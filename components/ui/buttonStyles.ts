export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
export const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent-light active:bg-accent-dark",
  secondary:
    "border border-border-hover text-foreground hover:bg-[rgba(250,250,248,0.05)]",
  ghost: "text-text-secondary hover:text-foreground",
};

export const buttonSizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-8 py-3.5 text-base",
};
