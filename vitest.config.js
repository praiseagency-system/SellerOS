import { defineConfig } from 'vitest/config'

// Batasi hanya ke tes aplikasi. Skrip GMV Max di scripts/ punya runner sendiri
// (node:test) dan tak boleh ikut terkumpul di sini.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
})
