import Skeleton from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Heading */}
        <Skeleton className="h-10 w-36" />

        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>

        {/* Section: Basic Info */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>

        {/* Section: Contact */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
          </div>
        </div>

        {/* Section: Visibility */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>

        {/* Save button */}
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}
