import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ message, title, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {icon ?? (
        <svg
          className="mb-3 h-10 w-10 text-ink-faint"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      )}
      {title && <h3 className="text-section-title text-ink">{title}</h3>}
      <p className="mt-1 max-w-sm text-description text-ink-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}