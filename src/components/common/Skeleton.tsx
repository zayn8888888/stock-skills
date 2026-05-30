import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "heading" | "card" | "avatar" | "table-row";
}

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  const variants: Record<string, string> = {
    text: "h-4 w-full rounded",
    heading: "h-7 w-1/3 rounded",
    card: "h-32 w-full rounded-lg",
    avatar: "h-10 w-10 rounded-full",
    "table-row": "h-10 w-full rounded",
  };

  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        variants[variant],
        className
      )}
    />
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton variant="table-row" className="h-8 opacity-50" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          variant="table-row"
          className="h-10"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}
