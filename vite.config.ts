import { defineConfig } from 'vite'

export default defineConfig({
  // relative URLs: the build works under any sub-path (GitHub Pages serves it at /truffe-dash/)
  base: './',
  // one bundle is fine: three.js makes most of its ~620 KB (~160 KB gzipped)
  build: { chunkSizeWarningLimit: 700 },
})
