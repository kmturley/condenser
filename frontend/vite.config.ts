import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';
import { defineConfig, Plugin } from 'vite';
import { getRuntimeConfig, getTlsOptions, getModeFromArg } from '../shared/runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const mode = getModeFromArg(process.argv.slice(2));
const config = getRuntimeConfig(mode);

// Resolve 'react', 'react/jsx-runtime', and 'condenser:plugin' to virtual
// modules so plugin code uses Steam's webpack-bundled React without bundling it.
const condenserShims: Plugin = {
  name: 'condenser-shims',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'react') return '\0virtual:condenser-react';
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return '\0virtual:condenser-react-jsx';
    if (id === 'condenser:api') return '\0virtual:condenser-api';
    return null;
  },
  load(id) {
    if (id === '\0virtual:condenser-react') {
      return `const R = window.__condenser.core.React;
export default R;
export const { useState, useEffect, useRef, useCallback, useMemo,
               createContext, useContext, useReducer, Fragment,
               createElement, forwardRef, memo } = R;`;
    }
    if (id === '\0virtual:condenser-react-jsx') {
      return `const R = window.__condenser.core.React;
export const jsx = R.createElement;
export const jsxs = R.createElement;
export const jsxDEV = R.createElement;
export const Fragment = R.Fragment;`;
    }
    if (id === '\0virtual:condenser-api') {
      return `const R = window.__condenser.core.React;
export function useSend(pluginId) {
  return R.useCallback(
    (action, data) => window.__condenser.plugins.callPlugin(pluginId, { action, data }),
    [pluginId],
  );
}`;
    }
    return null;
  },
  handleHotUpdate({ file, server }) {
    if (!file.startsWith(path.join(projectRoot, 'plugins') + path.sep)) return;
    const rel = path.relative(path.join(projectRoot, 'plugins'), file);
    const parts = rel.split(path.sep);
    if (parts.length < 2 || path.basename(file) !== 'frontend.tsx') return;
    const pluginId = parts[0];
    server.hot.send({ type: 'custom', event: 'condenser:plugin-updated', data: { id: pluginId, url: `/plugins/${pluginId}/frontend.tsx` } });
    return [];
  },
};

// Build entry points: boot.ts + one per plugin frontend.tsx
function getPluginEntries(): Record<string, string> {
  const entries: Record<string, string> = {
    'frontend/index': path.join(__dirname, 'index.ts'),
  };
  const pluginsDir = path.join(projectRoot, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const d of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const fp = path.join(pluginsDir, d.name, 'frontend.tsx');
      if (existsSync(fp)) {
        entries[`plugins/${d.name}/frontend`] = fp;
      }
    }
  }
  return entries;
}

export default defineConfig({
  plugins: [
    condenserShims,
  ],
  optimizeDeps: {
    exclude: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'condenser:api'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: getPluginEntries(),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '_chunks/[name]-[hash].js',
        format: 'es',
      },
    },
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
