/// <reference lib="dom" />
/// <reference types="vite/client" />

// Evaluated in Steam's SharedJSContext via native ESM import().
// Served by the Vite dev server so it can use ES module imports and TypeScript.
// The backend evaluates a tiny bootstrap string via CDP that does:
//   await import('http://localhost:3000/frontend/index.ts?t=...')
// All real setup happens here.

import './condenser.js'; // side-effect: populates window.__condenser.{tree,steam,qam,plugins}

// Satisfy @vitejs/plugin-react Fast Refresh preamble check so dynamically-imported
// plugin files don't throw. $RefreshReg$/$RefreshSig$ are no-ops — our own
// fs.watch + loadPlugin handles hot reload instead.
(window as any).__vite_plugin_react_preamble_installed__ = true;
(window as any).$RefreshReg$ ??= () => {};
(window as any).$RefreshSig$ ??= () => (type: any) => type;

const condenser: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });

if (condenser.core.booted) {
  console.info('[condenser] index.ts already loaded — skipping');
} else {
  condenser.core.booted = true;

  // 1. Discover React, ReactDOM and Steam views
  const contextError = condenser.steam.discoverSteamContext();
  if (contextError) {
    console.error('[condenser] Context error:', contextError);
  } else {
    // 2. Connect to backend WS and initiate plugin loading
    condenser.plugins.initPluginLoader();
  }

  if (import.meta.hot) {
    const viteOrigin = new URL(import.meta.url).origin;
    import.meta.hot.on('condenser:plugin-updated', ({ id, url }: { id: string; url: string }) => {
      condenser.plugins.loadPlugin(id, `${viteOrigin}${url}?t=${Date.now()}`);
    });
  }
}
