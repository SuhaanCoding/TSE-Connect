import Link from "next/link";
import Button from "@/components/ui/Button";

export default function ProfileNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-6xl font-heading font-black text-text-muted">404</p>
        <h1 className="mt-4 font-heading font-bold text-xl">
          Profile not found
        </h1>
        <p className="mt-2 text-text-muted text-sm">
          This alumni profile doesn&apos;t exist or isn&apos;t public.
        </p>
        <div className="mt-6">
          <Link href="/directory">
            <Button variant="secondary">Back to Directory</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
