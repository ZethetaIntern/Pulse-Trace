/**
 * PulseTrace dashboard — design tokens
 *
 * Tailwind maps the centralized CSS custom properties defined in
 * src/index.css (:root) onto semantic utility classes:
 *
 *   Surfaces:      bg-canvas, bg-surface
 *   Text:          text-ink, text-ink-muted, text-ink-faint
 *   Borders:       border-line, border-line-strong
 *   Action:        bg-primary, bg-primary-hover, bg-primary-soft
 *   Semantic:      bg/text success·warning·error·info·neutral (+ *-soft, *-text)
 *   Radius:        rounded-control, rounded-card, rounded-container
 *   Shadow:        shadow-card
 *   Type scale:    text-page-title, text-section-title, text-description,
 *                  text-meta, text-kpi
 *
 * The spacing scale uses Tailwind's native 4px base (space tokens in
 * index.css), so p-1/p-2/p-3/p-4/p-6/p-8/p-10 map to 4/8/12/16/24/32/40px.
 *
 * All token values must remain defined in index.css to keep a single
 * source of truth for the visual system.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          soft: 'rgb(var(--color-primary-soft) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
          text: 'rgb(var(--color-success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
          text: 'rgb(var(--color-warning-text) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
          soft: 'rgb(var(--color-error-soft) / <alpha-value>)',
          text: 'rgb(var(--color-error-text) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          soft: 'rgb(var(--color-info-soft) / <alpha-value>)',
          text: 'rgb(var(--color-info-text) / <alpha-value>)',
        },
        neutral: {
          DEFAULT: 'rgb(var(--color-neutral) / <alpha-value>)',
          soft: 'rgb(var(--color-neutral-soft) / <alpha-value>)',
          text: 'rgb(var(--color-neutral-text) / <alpha-value>)',
        },
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        container: 'var(--radius-container)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontSize: {
        'page-title': ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'section-title': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        description: ['0.875rem', { lineHeight: '1.25rem' }],
        meta: ['0.75rem', { lineHeight: '1rem' }],
        kpi: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};