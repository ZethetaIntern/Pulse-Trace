import { Button } from './ui/Button';

interface ErrorStateProps {
  message?: string;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, title, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <svg
        className="mb-3 h-10 w-10 text-error"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <h3 className="text-section-title text-ink">{title ?? 'Something went wrong'}</h3>
      {message && <p className="mt-1 max-w-sm text-description text-ink-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}