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

// Series colors — restrained semantic palette
const SERIES = {
  created: { name: 'Created', color: 'rgb(114 47 153)' }, // purple
  delivered: { name: 'Delivered', color: 'rgb(255 195 73)' }, // gold
  failed: { name: 'Failed', color: 'rgb(255 120 141)' }, // pink
  retried: { name: 'Retried', color: 'rgb(255 195 73 / 0.45)' }, // gold dimmed
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
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={buckets} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1D1D1D" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatDate(String(value), interval)}
              tick={{ fontSize: 11, fill: '#737373' }}
              tickLine={false}
              axisLine={{ stroke: '#242424' }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#737373' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: '#242424', strokeDasharray: '3 3' }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #303030',
                backgroundColor: '#111111',
                color: '#F5F5F5',
              }}
              labelStyle={{ color: '#F5F5F5' }}
              itemStyle={{ color: '#A1A1A1' }}
              labelFormatter={(label) => formatFullDate(label as string | number)}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: '#A1A1A1' }} />
            {Object.entries(SERIES).map(([key, series]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={series.name}
                stroke={series.color}
                strokeWidth={1.5}
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
