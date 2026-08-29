interface LoadingSkeletonProps {
  /** Number of skeleton lines to render. Default 3. */
  rows?: number;
  className?: string;
}

/**
 * Dark skeleton blocks used while content loads.
 * Uses dark elevated surface colors for a subtle shimmer.
 */
export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-2.5 ${className ?? ''}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded bg-elevated"
          style={i === rows - 1 ? { width: '60%' } : undefined}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
