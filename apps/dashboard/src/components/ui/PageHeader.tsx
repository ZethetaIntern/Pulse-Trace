import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional slot for header-level actions (e.g. a button). */
  actions?: ReactNode;
}

/**
 * Standard page header: title, optional description, optional actions.
 * Provides consistent vertical/horizontal spacing across all pages.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-page-title text-ink">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 max-w-3xl text-description text-ink-muted">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}