import Skeleton from "@/components/ui/Skeleton";

export default function ProfileDetailLoading() {
  return (
    <div className="pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <Skeleton className="h-4 w-32" />

        <div className="flex items-start gap-5">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <Skeleton className="h-10 w-44 rounded-lg" />

        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
