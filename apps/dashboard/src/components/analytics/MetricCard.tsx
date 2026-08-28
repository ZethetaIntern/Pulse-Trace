interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  compact?: boolean;
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

export function MetricCard({ label, value, subtitle, variant = 'default', compact = false }: MetricCardProps) {
  return (
    <div className={`rounded-card border ${compact ? 'p-4' : 'p-5'} ${VARIANT_STYLES[variant]}`}>
      <div className={`font-medium text-ink-muted ${compact ? 'text-xs' : 'text-sm'}`}>{label}</div>
      <div className={`text-kpi ${compact ? 'mt-1' : 'mt-2'} ${VALUE_STYLES[variant]}`}>{value}</div>
      {subtitle && <div className={`text-xs text-ink-faint ${compact ? 'mt-0.5' : 'mt-1'}`}>{subtitle}</div>}
    </div>
  );
}