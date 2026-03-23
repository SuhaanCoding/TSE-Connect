import Link from "next/link";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <img src="/logo.svg" alt="" className="h-12 w-auto opacity-20 mb-4" />
      <p className="font-heading font-black text-7xl md:text-9xl text-text-muted/20">
        404
      </p>
      <h1 className="mt-4 font-heading font-bold text-xl md:text-2xl text-foreground">
        Page not found
      </h1>
      <p className="mt-2 text-text-secondary text-sm text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/">
          <Button variant="primary">Go Home</Button>
        </Link>
        <Link href="/directory">
          <Button variant="secondary">Directory</Button>
        </Link>
      </div>
      <p className="mt-12 text-xs text-text-muted">
        TSE Connect — Triton Software Engineering
      </p>
    </div>
  );
}
