/// <reference lib="dom" />

import { getCondenser } from './condenser.js';

export function buildWebpackRegistry(): Map<string, any> {
  const chunkArray = (window as any).webpackChunksteamui as any[][];
  if (!chunkArray) throw new Error('webpackChunksteamui not found');
  let webpackRequire: any;
  chunkArray.push([[Symbol('@inject/probe')], {}, (r: any) => { webpackRequire = r; }]);
  if (!webpackRequire) throw new Error('Failed to capture webpack require');
  const registry = new Map<string, any>();
  for (const id of Object.keys(webpackRequire.m)) {
    try {
      const mod = webpackRequire(id);
      if (mod) registry.set(id, mod);
    } catch (_) {}
  }
  return registry;
}

export function findWebpackModule(registry: Map<string, any>, filter: (m: any) => boolean): any {
  for (const m of registry.values()) {
    if (m.default && filter(m.default)) return m.default;
    if (filter(m)) return m;
  }
  return null;
}

export function findWebpackModuleByExport(
  registry: Map<string, any>,
  filter: (exported: any) => boolean,
): any {
  for (const m of registry.values()) {
    for (const candidate of [m.default, m]) {
      if (!candidate || typeof candidate !== 'object') continue;
      for (const key of Object.keys(candidate)) {
        try { if (filter(candidate[key])) return candidate; } catch (_) {}
      }
    }
  }
  return null;
}

export function discoverSteamContext(): string | null {
  const condenser = getCondenser();
  const registry: Map<string, any> = condenser.core.webpackRegistry
    ?? (condenser.core.webpackRegistry = buildWebpackRegistry());

  condenser.core.React = condenser.core.React
    ?? findWebpackModule(registry, (m: any) => m.Component && m.PureComponent && m.useLayoutEffect);
  condenser.core.ReactDOM = condenser.core.ReactDOM
    ?? findWebpackModule(registry, (m: any) => typeof m.createRoot === 'function');

  if (!condenser.core.React) return 'React not found in webpack registry';
  if (!condenser.core.ReactDOM) return 'ReactDOM not found in webpack registry';

  if (!condenser.core.quickAccessMenuRenderer) {
    const isQAMRenderer = (v: any) => (v?.type?.toString?.() ?? '').includes('QuickAccessMenuBrowserView');
    const qamModule = findWebpackModuleByExport(registry, isQAMRenderer);
    if (qamModule) {
      condenser.core.quickAccessMenuRenderer =
        Object.values(qamModule as object).find(isQAMRenderer) ?? null;
    }
  }

  return null;
}
