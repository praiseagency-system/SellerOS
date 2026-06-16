/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Token semantik berbasis CSS variable → otomatis ikut tema (lihat index.css).
      colors: {
        app: 'rgb(var(--c-app) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        fill: 'rgb(var(--c-fill) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'var(--c-ink)',
          strong: 'var(--c-ink-strong)',
          muted: 'var(--c-ink-muted)',
          faint: 'var(--c-ink-faint)',
        },
      },
    },
  },
  plugins: [],
}
