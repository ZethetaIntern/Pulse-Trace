interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit?: number;
  onPageChange: (page: number) => void;
}

/** Build a compact window of page numbers with ellipsis gaps. */
function visiblePages(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const candidates = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...candidates].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out: Array<number | 'ellipsis'> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('ellipsis');
    out.push(p);
    prev = p;
  }
  return out;
}

interface PageButtonProps {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaCurrent?: 'page';
  onClick: () => void;
}

function PageButton({
  children,
  active = false,
  disabled = false,
  ariaLabel,
  ariaCurrent,
  onClick,
}: PageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={[
        'inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2.5 text-meta font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-primary text-white'
          : 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-neutral-soft',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function Pagination({ page, totalPages, total, limit = 20, onPageChange }: PaginationProps) {
  if (total <= 0) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const pages = visiblePages(page, totalPages);

  return (
    <nav aria-label="Pagination" className="border-t border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-ink-muted" role="status">
          Showing{' '}
          <span className="font-medium text-ink">{start}</span>
          {'–'}
          <span className="font-medium text-ink">{end}</span>
          {' of '}
          <span className="font-medium text-ink">{total}</span>
        </p>
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <PageButton
              ariaLabel="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </PageButton>
            {pages.map((p, i) =>
              p === 'ellipsis' ? (
                <span key={`ellipsis-${i}`} aria-hidden="true" className="px-1 text-meta text-ink-faint">
                  …
                </span>
              ) : (
                <PageButton
                  key={p}
                  active={p === page}
                  ariaLabel={`Page ${p}`}
                  ariaCurrent={p === page ? 'page' : undefined}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </PageButton>
              ),
            )}
            <PageButton
              ariaLabel="Next page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </PageButton>
          </div>
        )}
      </div>
    </nav>
  );
}