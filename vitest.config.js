import { defineConfig } from 'vitest/config'

// Batasi hanya ke tes aplikasi + gerbang fungsi serverless (api/_lib). Skrip
// GMV Max di scripts/ punya runner sendiri (node:test) dan tak boleh ikut
// terkumpul di sini.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
    environment: 'node',
  },
})
