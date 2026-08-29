import { ChannelBadge } from '../StatusBadge';
import { EmptyState } from '../EmptyState';
import type { ChannelStatResponse } from '../../types';

interface ChannelBreakdownProps {
  channels: ChannelStatResponse[];
}

export function ChannelBreakdown({ channels }: ChannelBreakdownProps) {
  if (channels.length === 0) {
    return <EmptyState compact title="No channel data available" message="Channel statistics will appear once notifications are processed." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-1.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Channel</th>
            <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Total</th>
            <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Delivered</th>
            <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Failed</th>
            <th scope="col" className="py-1.5 pl-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Success Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {channels.map((ch) => {
            const hasActivity = ch.total > 0;
            return (
              <tr key={ch.channel} className="hover:bg-elevated/50 transition-colors">
                <td className="py-1.5 pr-3"><ChannelBadge channel={ch.channel} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-ink">{ch.total}</td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right ${ch.delivered > 0 ? 'text-success-text' : 'text-ink-muted'}`}>{ch.delivered}</td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right ${ch.failed > 0 ? 'text-error-text' : 'text-ink-muted'}`}>{ch.failed}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="font-medium text-ink">{hasActivity ? `${ch.successRate}%` : '—'}</span>
                    {hasActivity && (
                      <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-elevated">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, ch.successRate))}%` }} />
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
