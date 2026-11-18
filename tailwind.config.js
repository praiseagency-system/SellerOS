// Warna yang nilainya tidak bisa diberi <alpha-value> (CSS variable berisi hex,
// atau currentColor). Tanpa ini, Tailwind diam-diam MEMBUANG kelas ber-modifier
// seperti `text-ink-faint/50` atau `ring-current/20`. Dengan modifier → color-mix
// ke transparent; tanpa modifier → nilai aslinya, persis seperti sebelumnya.
const mixable = (value) => ({ opacityValue, opacityVariable }) =>
  opacityVariable !== undefined || opacityValue === undefined
    ? value
    : `color-mix(in srgb, ${value} calc(${opacityValue} * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Skala default hanya kelipatan 5; nilai di luar skala (mis. `bg-fill/8`,
      // `bg-amber-500/12`) tidak di-generate sama sekali. Tambahkan nilai yang
      // dipakai di src/ — cek dengan `node scripts/check-tailwind-opacity.mjs`.
      opacity: {
        3: '0.03',
        4: '0.04',
        6: '0.06',
        8: '0.08',
        12: '0.12',
      },
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
        current: mixable('currentColor'),
        ink: {
          DEFAULT: mixable('var(--c-ink)'),
          strong: mixable('var(--c-ink-strong)'),
          muted: mixable('var(--c-ink-muted)'),
          faint: mixable('var(--c-ink-faint)'),
        },
      },
    },
  },
  plugins: [],
}
