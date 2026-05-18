/// <reference lib="dom" />
/// <reference types="vite/client" />

export function installPreamble(): void {
  (window as any).__vite_plugin_react_preamble_installed__ = true;
  (window as any).$RefreshReg$ ??= () => {};
  (window as any).$RefreshSig$ ??= () => (type: any) => type;
}

export function boot(): void {
  const condenser = (window as any).__condenser;
  if (condenser.core.booted) {
    console.info('[condenser] already loaded — skipping');
    return;
  }
  condenser.core.booted = true;

  const contextError = condenser.steam.discoverSteamContext();
  if (contextError) {
    console.error('[condenser] Context error:', contextError);
  } else {
    condenser.plugins.initPluginLoader();
  }

  if (import.meta.hot) {
    const viteOrigin = new URL(import.meta.url).origin;
    import.meta.hot.on('condenser:plugin-updated', ({ id, url }: { id: string; url: string }) => {
      condenser.plugins.loadPlugin(id, `${viteOrigin}${url}?t=${Date.now()}`);
    });
  }
}
