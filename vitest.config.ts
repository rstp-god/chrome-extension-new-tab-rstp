import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/background/**/*.test.{ts,tsx}',
      'src/widgets/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
    coverage: {
      reporter: ['text', 'html'],
      include: [
        'src/background/**/*.ts',
        'src/services/**/*.ts',
        'src/widgets/**/*.ts',
        'src/widgets/**/*.tsx',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
})
