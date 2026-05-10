/// <reference lib="dom" />

/**
 * Entry point evaluated inside Steam's SharedJSContext via Puppeteer CDP.
 * Must be entirely self-contained — serialised by Puppeteer via .toString().
 */
export function inject() {
  // tsx/esbuild rewrites named inner functions with __name(); define a no-op shim
  // so the serialised function body runs cleanly inside the browser.
  (window as any).__name = (f: any) => f;

  // 1. Declare Condenser library
  const condenser: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });
  const isReinjection: boolean = !!condenser.core.injected;
  condenser.core.injected = true;
  if (!(window as any).App?.BFinishedInitStageOne?.()) {
    condenser.core.injected = false;
    return { ready: false, error: 'Steam not ready' };
  }

  // 2. Declare shared references to React, ReactDOM and Steam views
  const contextError = condenser.shared.discoverSteamContext(condenser);
  if (contextError) return { ready: true, error: contextError };

  // 3. Loop through registered components and render them into Steam views
  for (const id of Object.keys(condenser.components as Record<string, any>)) {
    condenser.shared.renderComponent(id, condenser);
  }

  return {
    ready: true,
    success: true,
    isReinjection,
    reactVersion: condenser.core.React?.version,
    moduleCount: condenser.core.webpackRegistry?.size ?? 0,
    quickAccessMenuFound: !!condenser.core.quickAccessMenuRenderer,
  };
}
