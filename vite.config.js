import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: './' → aset di-link relatif, jadi build jalan baik di GitHub Pages
// project site (https://user.github.io/<repo>/) maupun hosting statis lain
// tanpa perlu tahu nama repo. App pakai state routing (bukan URL), jadi
// relative base aman.
export default defineConfig({
  base: './',
  plugins: [react()],
})
