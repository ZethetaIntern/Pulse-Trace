/**
 * PulseTrace brand mark — envelope/notification symbol with integrated pulse waveform.
 *
 * Inspired by notification infrastructure + message delivery + pulse monitoring.
 * Bold geometric construction, recognizable at 18–24px on dark backgrounds.
 *
 * - Envelope body + V-flap = messaging/delivery
 * - Notification badge with pulse mark = PulseTrace identity
 * - Pulse tick inside flap = trace/monitoring
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
      {/* ── Envelope body — bold geometric rectangle ────────── */}
      <rect
        x="3"
        y="8"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
      />

      {/* ── Envelope V-flap — converges at top center ───────── */}
      <path
        d="M3 8L12 15L21 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* ── Pulse tick inside flap — the "Trace" element ───── */}
      <path
        d="M7 10.5L9.5 8L11.5 12.5L14 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />

      {/* ── Notification badge circle — upper right ─────────── */}
      <circle cx="19.5" cy="6" r="4" fill="currentColor" />

      {/* ── Pulse mark inside badge — minimal waveform ──────── */}
      <path
        d="M17.5 6.2L18.8 6.2L19.3 4.5L20 7.8L20.7 5.5L21.5 6.2"
        stroke="#0B0B0B"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
