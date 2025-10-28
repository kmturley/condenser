import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({
    include: "**/*.{jsx,tsx}"
  })],
  root: '.',
  build: {
    outDir: '../dist'
  },
  server: {
    port: 3000,
    cors: true,
    hmr: {
      port: 3000
    }
  }
});
