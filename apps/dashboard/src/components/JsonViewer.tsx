import { useState } from 'react';

interface JsonViewerProps {
  data: Record<string, unknown>;
  label: string;
  defaultExpanded?: boolean;
}

export function JsonViewer({ data, label, defaultExpanded = false }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isEmpty = Object.keys(data).length === 0;

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {isEmpty && <span className="text-xs text-gray-400">empty</span>}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {expanded && !isEmpty && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <pre className="overflow-x-auto text-sm text-gray-700">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
