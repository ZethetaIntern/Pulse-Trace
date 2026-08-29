interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  compact?: boolean;
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-surface border-line',
  success: 'bg-surface border-line',
  danger: 'bg-surface border-line',
  warning: 'bg-surface border-line',
};

const VALUE_STYLES: Record<string, string> = {
  default: 'text-ink',
  success: 'text-success-text',
  danger: 'text-error-text',
  warning: 'text-warning-text',
};

export function MetricCard({ label, value, subtitle, variant = 'default', compact = false }: MetricCardProps) {
  return (
    <div className={`rounded-card border ${compact ? 'p-3.5' : 'p-4'} ${VARIANT_STYLES[variant]}`}>
      <div className={`font-medium text-ink-muted ${compact ? 'text-[11px]' : 'text-xs'}`}>{label}</div>
      <div className={`text-kpi ${compact ? 'mt-1' : 'mt-1.5'} ${VALUE_STYLES[variant]}`}>{value}</div>
      {subtitle && <div className={`text-[11px] text-ink-faint ${compact ? 'mt-0.5' : 'mt-1'}`}>{subtitle}</div>}
    </div>
  );
}
