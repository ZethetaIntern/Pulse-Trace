import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title. */
  title?: ReactNode;
  /** Optional small description under the title. */
  subtitle?: ReactNode;
  /** Optional action slot in the header (e.g. a button or controls). */
  action?: ReactNode;
  /** Apply standard card padding. Default true. */
  padded?: boolean;
  /** Subtle elevation; off by default to keep cards flat/restrained. */
  elevated?: boolean;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  action,
  padded = true,
  elevated = false,
  className,
  children,
  ...props
}: CardProps) {
  const hasHeader = title !== undefined || action !== undefined;

  return (
    <div
      className={[
        'rounded-card border border-line bg-surface',
        elevated ? 'shadow-card' : '',
        padded ? 'p-4' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {hasHeader && (
        <header className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title !== undefined && (
              <h3 className="truncate text-section-title text-ink">{title}</h3>
            )}
            {subtitle !== undefined && <p className="mt-0.5 text-meta text-ink-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </div>
  );
}