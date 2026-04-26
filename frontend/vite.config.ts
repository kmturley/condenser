import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getRuntimeConfig, getTlsOptions, getModeFromArg } from '../shared/runtime';

const mode = getModeFromArg(process.argv.slice(2));
const config = getRuntimeConfig(mode);

function preventFullReloadPlugin() {
  return {
    name: 'prevent-full-reload',
    configureServer(server) {
      const originalSend = server.ws.send;
      server.ws.send = function (payload) {
        if (payload.type === 'full-reload') {
          console.log('Preventing full reload to avoid Steam CEF crash');
          return;
        }
        originalSend.call(this, payload);
      };
    }
  };
}

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,tsx}',
    }),
    preventFullReloadPlugin()
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
