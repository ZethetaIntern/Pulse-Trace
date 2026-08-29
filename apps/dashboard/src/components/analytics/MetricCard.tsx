interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  compact?: boolean;
}

const VARIANT_STYLES: Record<string, string> = {
  default: '',
  success: '',
  danger: '',
  warning: '',
};

const VALUE_STYLES: Record<string, string> = {
  default: 'text-ink',
  success: 'text-success-text',
  danger: 'text-error-text',
  warning: 'text-warning-text',
};

export function MetricCard({ label, value, subtitle, variant = 'default', compact = false }: MetricCardProps) {
  return (
    <div className={`rounded-card border border-line bg-surface ${compact ? 'px-4 py-3' : 'p-4'}`}>
      <div className={`font-medium uppercase tracking-wider text-ink-faint ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {label}
      </div>
      <div className={`text-kpi ${compact ? 'mt-1' : 'mt-1.5'} ${VALUE_STYLES[variant]} ${VARIANT_STYLES[variant]}`}>
        {value}
      </div>
      {subtitle && <div className={`text-[11px] text-ink-faint ${compact ? 'mt-0.5' : 'mt-1'}`}>{subtitle}</div>}
    </div>
  );
}
