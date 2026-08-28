interface LoadingSkeletonProps {
  /** Number of skeleton lines to render. Default 3. */
  rows?: number;
  className?: string;
}

/**
 * Subtle skeleton blocks used while content loads.
 * Announces its presence to screen readers and respects reduced motion
 * via the global prefers-reduced-motion rule in index.css.
 */
export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-3 ${className ?? ''}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-neutral-soft"
          style={i === rows - 1 ? { width: '60%' } : undefined}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}