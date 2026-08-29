/**
 * PulseTrace dashboard — dark design tokens
 *
 * Near-black palette with semantic accent colors used sparingly.
 * 85–90% neutral dark surfaces, <5% accent colors.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        sidebar: 'rgb(var(--color-sidebar) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        'hover-surface': 'rgb(var(--color-hover-surface) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          secondary: 'rgb(var(--color-ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
          input: 'rgb(var(--color-line-input) / <alpha-value>)',
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
        'page-title': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'section-title': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        description: ['0.8125rem', { lineHeight: '1.25rem' }],
        meta: ['0.6875rem', { lineHeight: '1rem' }],
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
