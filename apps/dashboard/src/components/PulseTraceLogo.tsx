/**
 * PulseTrace brand mark — geometric frame with integrated pulse waveform.
 *
 * Clean, geometric construction for recognition at 18–24px on dark backgrounds.
 *
 * - Rounded square frame = structure / infrastructure
 * - Pulse waveform = monitoring / trace
 * - Gold accent dot at pulse peak = PulseTrace identity
 * - Gold accent (#FFC349) on dark sidebar (#0B0B0B)
 */
export function PulseTraceLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* ── Geometric frame — clean rounded square ────────── */}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        stroke="rgb(var(--color-ink))"
        strokeWidth="1.6"
      />

      {/* ── Pulse waveform — the core identity ────────────── */}
      <path
        d="M6 12h3l1.5-3.5 1.5 7 1.5-3.5h3"
        stroke="rgb(var(--color-ink))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ── Gold accent dot at pulse peak — restrained ────── */}
      <circle cx="10.5" cy="8.5" r="1.2" fill="rgb(var(--color-primary))" />
    </svg>
  );
}
