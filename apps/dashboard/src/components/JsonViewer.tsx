import { useId, useState } from 'react';

interface JsonViewerProps {
  data: Record<string, unknown>;
  label: string;
  defaultExpanded?: boolean;
}

export function JsonViewer({ data, label, defaultExpanded = false }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const isEmpty = Object.keys(data).length === 0;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-elevated/50"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {isEmpty && <span className="text-[10px] text-ink-faint">empty</span>}
          <svg className={`h-3.5 w-3.5 text-ink-faint transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {expanded && !isEmpty && (
        <div id={panelId} className="border-t border-line bg-sidebar p-3">
          <pre className="overflow-x-auto text-[11px] leading-relaxed text-ink-secondary">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
