import Link from "next/link";
import Badge from "@/components/ui/Badge";

export default function KeywordTags({
  keywords = [],
  compact = false,
}: {
  keywords?: string[];
  compact?: boolean;
}) {
  if (!keywords.length) return null;
  const visible = compact ? keywords.slice(0, 3) : keywords;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((keyword) =>
        compact ? (
          <Badge
            key={keyword}
            variant="accent"
            className="max-w-full break-words text-[11px]"
          >
            {keyword}
          </Badge>
        ) : (
          <Link
            key={keyword}
            href={`/directory?q=${encodeURIComponent(keyword)}`}
            className="max-w-full rounded-full cursor-pointer transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Badge variant="accent" className="max-w-full break-words">
              {keyword}
            </Badge>
          </Link>
        ),
      )}
      {compact && keywords.length > visible.length && (
        <span className="self-center text-[11px] text-text-muted">
          +{keywords.length - visible.length} more
        </span>
      )}
    </div>
  );
}
