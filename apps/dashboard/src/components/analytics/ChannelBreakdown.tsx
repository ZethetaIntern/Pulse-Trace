import { ChannelBadge } from '../StatusBadge';
import type { ChannelStatResponse } from '../../types';

interface ChannelBreakdownProps {
  channels: ChannelStatResponse[];
}

export function ChannelBreakdown({ channels }: ChannelBreakdownProps) {
  if (channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No channel data available.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Channel
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Total
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Delivered
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Failed
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Success Rate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {channels.map((ch) => (
            <tr key={ch.channel} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3">
                <ChannelBadge channel={ch.channel} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                {ch.total}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-700">
                {ch.delivered}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-700">
                {ch.failed}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                {ch.successRate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
