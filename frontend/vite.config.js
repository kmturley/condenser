import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { networkInterfaces } from 'os';

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

function getDevServerIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export default defineConfig({
  plugins: [react({
    include: "**/*.{jsx,tsx}"
  })],
  root: '.',
  build: {
    outDir: '../dist'
  },
  define: {
    __DEV_SERVER_IP__: JSON.stringify(getDevServerIP())
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    https: getHTTPS(),
    cors: true,
    hmr: false
  }
});
