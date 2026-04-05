import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`,
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-showcase',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        showcase: path.resolve(__dirname, 'showcase.html'),
      },
    },
  },
})
