import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    cors: true
  },
  build: {
    lib: {
      entry: 'index.ts',
      name: 'Frontend',
      fileName: 'frontend',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.js'
      }
    }
  }
});
