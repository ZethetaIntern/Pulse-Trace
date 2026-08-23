interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-white border-gray-200',
  success: 'bg-green-50 border-green-200',
  danger: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
};

const VALUE_STYLES: Record<string, string> = {
  default: 'text-gray-900',
  success: 'text-green-700',
  danger: 'text-red-700',
  warning: 'text-amber-700',
};

export function MetricCard({ label, value, subtitle, variant = 'default' }: MetricCardProps) {
  return (
    <div className={`rounded-lg border p-5 ${VARIANT_STYLES[variant]}`}>
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${VALUE_STYLES[variant]}`}>{value}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-400">{subtitle}</div>}
    </div>
  );
}
