import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getRuntimeConfig, getTlsOptions, getTopologyFromArg } from '../shared/runtime';

const topology = getTopologyFromArg(process.argv.slice(2));
const config = getRuntimeConfig(topology);

export default defineConfig({
  plugins: [react({
    include: '**/*.{jsx,tsx}',
  })],
  build: {
    outDir: '../dist',
  },
  define: {
    __BACKEND_WS_ORIGIN__: JSON.stringify(config.backendWsOrigin),
  },
  server: {
    port: config.frontendPort,
    host: config.bindHost,
    https: getTlsOptions(topology),
    cors: {
      origin: config.allowedOrigins,
    },
    allowedHosts: config.allowedHosts,
    hmr: false,
  },
});
