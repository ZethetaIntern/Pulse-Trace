import { NavLink } from 'react-router-dom';
import { PulseTraceLogo } from './PulseTraceLogo';

/* ──────────────────────────────────────────────────────────────────
 * Distinct inline SVG icons — 18px, stroke-based, consistent style.
 * Analytics = TrendingUp (rising line chart)
 * Monitoring = Activity (pulse / heartbeat monitor)
 * Overview = LayoutDashboard (grid)
 * Notifications = Bell
 * ────────────────────────────────────────────────────────────────── */

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {/* 2×2 grid — dashboard layout */}
      <rect x="2" y="2" width="6" height="6" rx="1.2" />
      <rect x="10" y="2" width="6" height="3.5" rx="1.2" />
      <rect x="10" y="7.5" width="6" height="8.5" rx="1.2" />
      <rect x="2" y="10" width="6" height="6" rx="1.2" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 6.5a4.5 4.5 0 00-9 0c0 4.5-1.5 6-1.5 6h12s-1.5-1.5-1.5-6z" />
      <path d="M10.3 15a1.5 1.5 0 01-2.6 0" />
    </svg>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {/* Rising trend line with data points */}
      <polyline points="2,13 5.5,9 8.5,11 12,5 16,3" />
      {/* Upward arrow at the end */}
      <polyline points="12,3 16,3 16,7" />
      {/* Subtle baseline */}
      <line x1="2" y1="16" x2="16" y2="16" opacity="0.3" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {/* Heartbeat / ECG pulse line */}
      <polyline points="1,9 4,9 5.5,5 7.5,13 9.5,6 11,9 13,9 14.5,7 17,9" />
      {/* Baseline dots */}
      <circle cx="1" cy="9" r="0.7" fill="currentColor" opacity="0.4" />
      <circle cx="17" cy="9" r="0.7" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

const navItems = [
  { to: '/', label: 'Overview', Icon: OverviewIcon },
  { to: '/notifications', label: 'Notifications', Icon: BellIcon },
  { to: '/analytics', label: 'Analytics', Icon: TrendingUpIcon },
  { to: '/monitoring', label: 'Monitoring', Icon: ActivityIcon },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-12 shrink-0 flex-col border-r border-line bg-sidebar md:w-[220px]">
      {/* ── Brand Header ───────────────────────────────────────── */}
      <div className="flex h-14 items-center justify-center border-b border-line px-1 md:h-[56px] md:justify-start md:px-4">
        <PulseTraceLogo size={22} className="text-primary" />
        <span className="ml-2.5 hidden text-[14px] font-semibold tracking-[-0.015em] text-ink md:inline">
          PulseTrace
        </span>
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 pt-3 md:px-2.5">
        {/* Group label */}
        <span className="mb-1 hidden pl-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint md:block">
          Operations
        </span>

        {/* Nav items */}
        <div className="space-y-[2px]">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center rounded-[6px] transition-colors duration-150 ${
                  /* Mobile: centered icon row */
                  'h-9 justify-center px-0'
                } md:h-[34px] md:justify-start md:gap-2.5 md:px-2.5 ${
                  isActive
                    ? 'bg-elevated text-ink'
                    : 'text-ink-muted hover:bg-elevated/50 hover:text-ink-secondary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Gold left indicator — active state */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-r bg-primary"
                    />
                  )}

                  {/* Icon */}
                  <item.Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-colors duration-150 ${
                      isActive
                        ? 'text-primary'
                        : 'text-ink-muted group-hover:text-ink-secondary'
                    }`}
                  />

                  {/* Label — hidden on mobile */}
                  <span className="hidden text-[13px] font-medium md:inline">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="hidden border-t border-line px-4 py-2.5 text-center text-[11px] text-ink-faint">
        Developer Dashboard
      </div>
    </aside>
  );
}
