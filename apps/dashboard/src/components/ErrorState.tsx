import { Button } from './ui/Button';

interface ErrorStateProps {
  message?: string;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, title, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <svg
        className="mb-1.5 h-5 w-5 text-error"
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
      <h3 className="text-[13px] font-medium text-ink">{title ?? 'Something went wrong'}</h3>
      {message && <p className="mt-0.5 max-w-sm text-[12px] text-ink-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2.5" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
