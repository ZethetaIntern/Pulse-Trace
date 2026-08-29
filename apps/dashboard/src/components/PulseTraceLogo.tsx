/**
 * PulseTrace brand mark — abstract P with integrated pulse waveform.
 *
 * Geometric, minimal, recognizable at 18–24px.
 * Works on #0B0B0B background in white/gold.
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
      {/* P letterform — geometric, modern */}
      <path
        d="M6 4h6.5c3.04 0 5.5 2.46 5.5 5.5 0 2.8-2.06 5.12-4.74 5.46L13.25 15H6V4z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Vertical stem accent */}
      <path
        d="M6 4v11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Pulse waveform — the signature element */}
      <path
        d="M2 17.5h2.5l1.5-2 2 4 2-6 1.5 3 1.5-2h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
    </svg>
  );
}
