interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-surface border-line',
  success: 'bg-success-soft border-success/30',
  danger: 'bg-error-soft border-error/30',
  warning: 'bg-warning-soft border-warning/30',
};

const VALUE_STYLES: Record<string, string> = {
  default: 'text-ink',
  success: 'text-success-text',
  danger: 'text-error-text',
  warning: 'text-warning-text',
};

export function MetricCard({ label, value, subtitle, variant = 'default' }: MetricCardProps) {
  return (
    <div className={`rounded-card border p-5 ${VARIANT_STYLES[variant]}`}>
      <div className="text-sm font-medium text-ink-muted">{label}</div>
      <div className={`mt-2 text-kpi ${VALUE_STYLES[variant]}`}>{value}</div>
      {subtitle && <div className="mt-1 text-xs text-ink-faint">{subtitle}</div>}
    </div>
  );
}