import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getRuntimeConfig, getTlsOptions, getModeFromArg } from '../shared/runtime';

const mode = getModeFromArg(process.argv.slice(2));
const config = getRuntimeConfig(mode);

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,tsx}',
    })
  ],
  build: {
    outDir: '../dist',
  },
  define: {
    CONDENSER_URL: JSON.stringify(config.backendWsOrigin),
    CONDENSER_DEBUG: config.enableDebugLogs,
  },
  server: {
    port: config.frontendPort,
    host: config.bindHost,
    https: getTlsOptions(mode),
    cors: {
      origin: config.allowedOrigins,
    },
    allowedHosts: config.allowedHosts,
    hmr: {
      protocol: getRuntimeConfig(mode).certPath ? 'wss' : 'ws',
      host: config.publicHost,
      port: config.frontendPort,
      overlay: false,
    },
  },
});
