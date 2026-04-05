import tailwindcss from '@tailwindcss/vite'
import { copyFile } from 'node:fs/promises'
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
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'showcase-root-index',
      async closeBundle() {
        const outDir = path.resolve(__dirname, 'dist-showcase')
        await copyFile(
          path.join(outDir, 'showcase.html'),
          path.join(outDir, 'index.html')
        )
      },
    },
  ],
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
