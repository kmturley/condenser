import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { join } from 'path';

function getHTTPS() {
  try {
    const certsPath = join(process.cwd(), 'certs');
    return {
      key: readFileSync(join(certsPath, 'key.pem')),
      cert: readFileSync(join(certsPath, 'cert.pem'))
    };
  } catch (e) {
    console.log('No SSL certificates found, using HTTP');
    return false;
  }
}

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
    host: '0.0.0.0',
    https: getHTTPS(),
    cors: true,
    hmr: false
  }
});
