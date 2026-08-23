import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendBucketResponse } from '../../types';

interface DeliveryTrendChartProps {
  buckets: TrendBucketResponse[];
  interval: string;
}

function formatDate(dateStr: string, interval: string): string {
  const d = new Date(dateStr);
  if (interval === 'hour') {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (interval === 'week' || interval === 'month') {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipDate(dateStr: React.ReactNode): string {
  if (typeof dateStr !== 'string') return String(dateStr ?? '');
  return new Date(dateStr).toLocaleString();
}

export function DeliveryTrendChart({ buckets, interval }: DeliveryTrendChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No trend data available for the selected period.
      </div>
    );
  }

  const data = buckets.map((b) => ({
    ...b,
    label: formatDate(b.date, interval),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={(label) => formatTooltipDate(label)}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="created" stroke="#6366f1" strokeWidth={2} dot={false} name="Created" />
        <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered" />
        <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} name="Failed" />
        <Line type="monotone" dataKey="retried" stroke="#f97316" strokeWidth={2} dot={false} name="Retried" />
      </LineChart>
    </ResponsiveContainer>
  );
}
