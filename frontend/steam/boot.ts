/// <reference lib="dom" />

// boot.ts — evaluated in Steam's SharedJSContext via native ESM import().
// Served by the Vite dev server so it can use ES module imports and TypeScript.
// The backend evaluates a tiny bootstrap string via CDP that does:
//   await import('http://localhost:3000/steam/boot.ts?v=...')
// All real setup happens here.

import '../shared/index.ts'; // side-effect: populates window.__condenser.shared.*

// Satisfy @vitejs/plugin-react Fast Refresh preamble check so dynamically-imported
// plugin files don't throw. $RefreshReg$/$RefreshSig$ are no-ops — our own
// fs.watch + loadPlugin handles hot reload instead.
(window as any).__vite_plugin_react_preamble_installed__ = true;
(window as any).$RefreshReg$ ??= () => {};
(window as any).$RefreshSig$ ??= () => (type: any) => type;

const condenser: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });

if (condenser.core.booted) {
  console.info('[condenser] boot.ts already loaded — skipping');
} else {
  condenser.core.booted = true;

  // 1. Discover React, ReactDOM and Steam views
  const contextError = condenser.shared.discoverSteamContext(condenser);
  if (contextError) {
    console.error('[condenser] Context error:', contextError);
  } else {
    // 2. Connect to backend WS and initiate plugin loading
    await condenser.shared.initPluginLoader(condenser);
  }

  if (import.meta.hot) {
    import.meta.hot.on('condenser:plugin-updated', ({ id, url }: { id: string; url: string }) => {
      condenser.shared.loadPlugin(id, `${location.origin}${url}?t=${Date.now()}`, condenser);
    });
  }
}
