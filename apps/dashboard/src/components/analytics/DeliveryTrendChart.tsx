import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendBucketResponse } from '../../types';

interface DeliveryTrendChartProps {
  buckets: TrendBucketResponse[];
  interval: string;
}

// Series colors mirror the semantic design tokens in index.css.
const SERIES = {
  created: { name: 'Created', color: 'rgb(37 99 235)' }, // info
  delivered: { name: 'Delivered', color: 'rgb(22 163 74)' }, // success
  failed: { name: 'Failed', color: 'rgb(220 38 38)' }, // error
  retried: { name: 'Retried', color: 'rgb(217 119 6)' }, // warning
} as const;

function formatDate(dateStr: string, interval: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  if (interval === 'hour') {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (interval === 'week' || interval === 'month') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string | number): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString();
}

export function DeliveryTrendChart({ buckets, interval }: DeliveryTrendChartProps) {
  if (buckets.length === 0) return null;

  const hasActivity = buckets.some((b) => b.created + b.delivered + b.failed + b.retried > 0);
  const totals = buckets.reduce(
    (acc, b) => ({
      created: acc.created + b.created,
      delivered: acc.delivered + b.delivered,
      failed: acc.failed + b.failed,
      retried: acc.retried + b.retried,
    }),
    { created: 0, delivered: 0, failed: 0, retried: 0 },
  );

  return (
    <figure>
      <figcaption className="sr-only">
        Delivery trends by date, {buckets.length} data points. Totals: {totals.created} created,{' '}
        {totals.delivered} delivered, {totals.failed} failed, {totals.retried} retried.
      </figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={buckets} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatDate(String(value), interval)}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db' }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: '#d1d5db', strokeDasharray: '3 3' }}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db' }}
              labelFormatter={(label) => formatFullDate(label as string | number)}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {Object.entries(SERIES).map(([key, series]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Delivery trends summary</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Created</th>
            <th scope="col">Delivered</th>
            <th scope="col">Failed</th>
            <th scope="col">Retried</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.date}>
              <td>{formatFullDate(b.date)}</td>
              <td>{b.created}</td>
              <td>{b.delivered}</td>
              <td>{b.failed}</td>
              <td>{b.retried}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hasActivity && (
        <p className="mt-2 text-meta text-ink-faint">No delivery activity recorded in this period.</p>
      )}
    </figure>
  );
}