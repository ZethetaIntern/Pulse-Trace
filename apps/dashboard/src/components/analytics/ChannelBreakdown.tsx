import { ChannelBadge } from '../StatusBadge';
import { EmptyState } from '../EmptyState';
import type { ChannelStatResponse } from '../../types';

interface ChannelBreakdownProps {
  channels: ChannelStatResponse[];
}

export function ChannelBreakdown({ channels }: ChannelBreakdownProps) {
  if (channels.length === 0) {
    return (
      <EmptyState
        compact
        title="No channel data available"
        message="Channel statistics will appear once notifications are processed."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2.5 pr-4 text-left text-meta font-medium text-ink-faint">
              Channel
            </th>
            <th scope="col" className="px-4 py-2.5 text-right text-meta font-medium text-ink-faint">
              Total
            </th>
            <th scope="col" className="px-4 py-2.5 text-right text-meta font-medium text-ink-faint">
              Delivered
            </th>
            <th scope="col" className="px-4 py-2.5 text-right text-meta font-medium text-ink-faint">
              Failed
            </th>
            <th scope="col" className="py-2.5 pl-4 text-right text-meta font-medium text-ink-faint">
              Success Rate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {channels.map((ch) => {
            const hasActivity = ch.total > 0;
            return (
              <tr key={ch.channel} className="hover:bg-neutral-soft/50">
                <td className="py-2.5 pr-4">
                  <ChannelBadge channel={ch.channel} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-ink">
                  {ch.total}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right ${
                    ch.delivered > 0 ? 'text-success-text' : 'text-ink'
                  }`}
                >
                  {ch.delivered}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right ${
                    ch.failed > 0 ? 'text-error-text' : 'text-ink'
                  }`}
                >
                  {ch.failed}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="font-medium text-ink">
                      {hasActivity ? `${ch.successRate}%` : '—'}
                    </span>
                    {hasActivity && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-soft"
                      >
                        <span
                          className="block h-full rounded-full bg-success"
                          style={{ width: `${Math.min(100, Math.max(0, ch.successRate))}%` }}
                        />
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}