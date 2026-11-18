#!/usr/bin/env node
// Memastikan setiap kelas Tailwind ber-opacity-modifier di src/ (mis.
// `bg-amber-500/12`, `hover:border-line/8`) benar-benar ter-generate di CSS
// hasil build. Tailwind diam-diam mengabaikan nilai di luar skala `opacity`
// (default hanya kelipatan 5), sehingga latar/garisnya tidak tampil.
//
// Pakai: npx vite build && node scripts/check-tailwind-opacity.mjs [file.css]
// Tanpa argumen, memeriksa semua dist/assets/*.css.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

const UTILS = 'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|divide|from|to|via|outline|shadow|placeholder|decoration|caret|accent|fill|stroke'
// varian opsional (hover:, dark:, group-hover:, md:, …) + utilitas-warna/angka
const TOKEN = new RegExp(
  String.raw`(?<![\w:/-])((?:[a-z0-9-]+:)*(?:${UTILS})-[a-z][a-z0-9-]*\/\d+)(?![\w/.\[-])`,
  'g',
)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.js', '.jsx', '.html'].includes(extname(p))) out.push(p)
  }
  return out
}

function cssFiles() {
  const arg = process.argv[2]
  if (arg) return [arg]
  const dir = join(ROOT, 'dist', 'assets')
  return readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => join(dir, f))
}

const used = new Map() // kelas → file pertama yang memakainya
for (const file of [...walk(SRC), join(ROOT, 'index.html')]) {
  for (const [, cls] of readFileSync(file, 'utf8').matchAll(TOKEN)) {
    if (!used.has(cls)) used.set(cls, file.slice(ROOT.length))
  }
}

let css
try {
  css = cssFiles().map((f) => readFileSync(f, 'utf8')).join('\n')
} catch (err) {
  console.error(`Tidak bisa membaca CSS hasil build (${err.message}). Jalankan \`npx vite build\` dulu.`)
  process.exit(2)
}

// Selector CSS: `hover:bg-fill/3` → `.hover\:bg-fill\/3`. Batas di belakang
// wajib, supaya `.bg-fill\/3` tidak dianggap ada hanya karena `.bg-fill\/30` ada.
const cssEscape = (cls) => cls.replace(/[:/.]/g, (c) => `\\${c}`)
const reEscape = (s) => s.replace(/[\\^$.*+?()[\]{}|/-]/g, (c) => `\\${c}`)
const generated = (cls) => new RegExp(`\\.${reEscape(cssEscape(cls))}(?![\\w-])`).test(css)
const missing = [...used].filter(([cls]) => !generated(cls))

if (missing.length) {
  console.error(`${missing.length} dari ${used.size} kelas opacity tidak ada di CSS hasil build:`)
  for (const [cls, file] of missing.sort()) console.error(`  ${cls}  (${file})`)
  process.exit(1)
}
console.log(`OK: semua ${used.size} kelas opacity di src/ ter-generate.`)
