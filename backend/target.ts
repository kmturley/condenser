/// <reference lib="dom" />

import puppeteer, { Browser, Page, Target } from 'puppeteer';
import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../shared/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getRuntimeConfig, getModeFromArg, Mode } from '../shared/runtime.js';

interface ChromeVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

const RECONNECT_INTERVAL_MS = 5_000;
const COMPONENT_PATH = path.join(__dirname, '..', 'frontend', 'components', 'Counter.tsx');

const STEAM_SHARED_CONTEXT_TITLES = new Set([
  'SharedJSContext',
  'Steam Shared Context presented by Valve™',
  'Steam',
  'SP',
]);

export function isSteamSharedContextTab(title: string, url: string): boolean {
  return (
    (url.includes('https://steamloopback.host/routes/') ||
      url.includes('https://steamloopback.host/index.html')) &&
    STEAM_SHARED_CONTEXT_TITLES.has(title)
  );
}

export function transpile(filePath: string): string {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  });
  return [
    '(function() { const module = { exports: {} }; const exports = module.exports;',
    outputText,
    'window.__component = module.exports.default ?? module.exports; })();',
  ].join('\n');
}

async function reloadComponent(page: Page, filePath: string): Promise<void> {
  await page.evaluate(transpile(filePath));
  await page.evaluate(() => { (window as any).__forceUpdate?.(); });
}

/**
 * Injects a Condenser tab into Steam's Quick Access Menu via webpack registry
 * and React fiber patching. Must be entirely self-contained — serialised by
 * Puppeteer via .toString() and evaluated inside SharedJSContext over CDP.
 *
 * Reads window.__condenserUrl for the WebSocket backend URL.
 * Returns { ready: false } when Steam hasn't finished initialising.
 */
export function inject() {
  // tsx/esbuild rewrites named inner functions with __name(); define a no-op shim
  // so the serialised function body runs cleanly inside the browser.
  (window as any).__name = (f: any) => f;

  const isReinjection: boolean = !!(window as any).__injected;
  (window as any).__injected = true;

  if (!(window as any).App?.BFinishedInitStageOne?.()) {
    (window as any).__injected = false;
    return { ready: false, error: 'Steam not ready' };
  }

  function wrapReturnValue(object: any, property: string, handler: (args: any[], returnValue: any) => any): void {
    const original = object[property];
    object[property] = function(this: any, ...args: any[]) {
      return handler.call(this, args, original.call(this, ...args));
    };
    object[property].toString = () => original.toString();
  }

  function buildWebpackRegistry(): Map<string, any> {
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

  function findWebpackModule(registry: Map<string, any>, filter: (m: any) => boolean): any {
    for (const m of registry.values()) {
      if (m.default && filter(m.default)) return m.default;
      if (filter(m)) return m;
    }
    return null;
  }

  function findWebpackModuleByExport(registry: Map<string, any>, filter: (exported: any) => boolean): any {
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

  function findInTree(node: any, filter: (n: any) => boolean, walkKeys: string[]): any {
    if (!node || typeof node !== 'object') return null;
    if (filter(node)) return node;
    if (Array.isArray(node)) return node.map(x => findInTree(x, filter, walkKeys)).find(Boolean) ?? null;
    return walkKeys.map(k => findInTree(node[k], filter, walkKeys)).find(Boolean) ?? null;
  }

  function findInFiberTree(node: any, filter: (n: any) => boolean): any {
    return findInTree(node, filter, ['child', 'sibling']);
  }

  function findInElementTree(node: any, filter: (n: any) => boolean): any {
    return findInTree(node, filter, ['props', 'children', 'child', 'sibling']);
  }

  function getReactFiberRoot(element: any): any {
    const key = Object.keys(element).find((k: string) => k.startsWith('__reactContainer$'));
    return key ? element[key] : element['_reactRootContainer']?._internalRoot?.current;
  }

  const registry: Map<string, any> =
    (window as any).__webpackRegistry ?? ((window as any).__webpackRegistry = buildWebpackRegistry());

  const React    = findWebpackModule(registry, (m: any) => m.Component && m.PureComponent && m.useLayoutEffect);
  const ReactDOM = findWebpackModule(registry, (m: any) => typeof m.createRoot === 'function');
  if (!React)    return { ready: true, error: 'React not found in webpack registry' };
  if (!ReactDOM) return { ready: true, error: 'ReactDOM not found in webpack registry' };

  function isQuickAccessMenuRenderer(exported: any): boolean {
    return (exported?.type?.toString?.() ?? '').includes('QuickAccessMenuBrowserView');
  }

  let quickAccessMenuRenderer: any = (window as any).__quickAccessMenuRenderer ?? null;
  if (!quickAccessMenuRenderer) {
    const quickAccessMenuModule = findWebpackModuleByExport(registry, isQuickAccessMenuRenderer);
    if (!quickAccessMenuModule) return { ready: true, error: 'Quick Access Menu module not found' };
    quickAccessMenuRenderer = Object.values(quickAccessMenuModule as object).find(isQuickAccessMenuRenderer) as any;
    if (!quickAccessMenuRenderer) return { ready: true, error: 'Quick Access Menu renderer not found' };
    (window as any).__quickAccessMenuRenderer = quickAccessMenuRenderer;
  }

  function InjectedTabPanel(props: any) {
    const [, setTick] = props.React.useState(0);
    (window as any).__forceUpdate = () => setTick((t: number) => t + 1);
    const Component = (window as any).__component;
    return Component
      ? props.React.createElement(Component, { React: props.React, websocketUrl: props.websocketUrl })
      : null;
  }

  const injectedTab = {
    key: 'condenser',
    title: 'Condenser',
    tab: React.createElement('span', { style: { fontSize: 20 } }, '⚙'),
    initialVisibility: false,
    panel: React.createElement(InjectedTabPanel, { React, websocketUrl: (window as any).__condenserUrl }),
  };

  const patchedTypeCache: Map<any, any> =
    (window as any).__patchedTypeCache ?? ((window as any).__patchedTypeCache = new Map());

  function appendInjectedTab(_args: any[], returnValue: any): any {
    const tabsNode = findInElementTree(returnValue, (x: any) => Array.isArray(x?.props?.tabs));
    if (tabsNode && !tabsNode.props.tabs.some((t: any) => t.key === 'condenser')) {
      tabsNode.props.tabs.push(injectedTab);
    }
    return returnValue;
  }

  if (!(window as any).__condenserPatched) {
    (window as any).__condenserPatched = true;
    wrapReturnValue(quickAccessMenuRenderer, 'type', (_outerArgs: any[], outerReturnValue: any) => {
      const innerElement = findInElementTree(outerReturnValue, (x: any) => x?.props?.onFocusNavDeactivated !== undefined);
      if (innerElement) {
        const cached = patchedTypeCache.get(innerElement.type);
        if (cached) {
          innerElement.type = cached;
        } else {
          const originalType = innerElement.type;
          if (typeof originalType === 'function') {
            wrapReturnValue(innerElement, 'type', appendInjectedTab);
          }
          patchedTypeCache.set(originalType, innerElement.type);
        }
      }
      return outerReturnValue;
    });
  }

  const rootElement = document.getElementById('root');
  const fiberRoot = rootElement ? getReactFiberRoot(rootElement) : null;
  const quickAccessMenuFiberNode = fiberRoot
    ? findInFiberTree(fiberRoot, (n: any) => n.elementType === quickAccessMenuRenderer)
    : null;
  if (quickAccessMenuFiberNode) {
    quickAccessMenuFiberNode.type = quickAccessMenuFiberNode.elementType.type;
    if (quickAccessMenuFiberNode.alternate) quickAccessMenuFiberNode.alternate.type = quickAccessMenuFiberNode.type;
  }

  return {
    ready: true,
    success: true,
    isReinjection,
    reactVersion: React.version,
    moduleCount: registry.size,
    quickAccessMenuFound: !!quickAccessMenuFiberNode,
  };
}

async function findSteamSharedContextPage(browser: Browser): Promise<Page | null> {
  for (const target of browser.targets()) {
    if (target.type() !== 'page') continue;
    const url = target.url();
    if (!url.includes('steamloopback.host')) continue;
    try {
      const page = await target.page();
      if (!page) continue;
      const title = await page.title();
      if (isSteamSharedContextTab(title, url)) {
        console.log(`[target] Found SharedJSContext: "${title}" @ ${url}`);
        return page;
      }
    } catch {}
  }
  return null;
}

async function pageSetup(
  page: Page,
  websocketUrl: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if ((page as any)._condenserSetup) return;
  (page as any)._condenserSetup = true;

  page.on('console', msg => logger.info('[browser]', msg.text()));
  page.setBypassCSP(true);

  await page.evaluate((url: string) => { (window as any).__condenserUrl = url; }, websocketUrl);

  let result: any;
  while (true) {
    result = await page.evaluate(inject).catch((e: Error) => ({ error: e.message }));
    logger.info('Inject:', JSON.stringify(result));
    if (result?.ready === false) {
      logger.info('Waiting for Steam init, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    break;
  }

  if (result?.error && result?.ready !== false) {
    logger.error('Inject failed:', result.error);
    return;
  }

  if (fs.existsSync(COMPONENT_PATH)) {
    await reloadComponent(page, COMPONENT_PATH);
    logger.info('Component loaded — open Quick Access Menu → ⚙ tab. Watching for changes...');
  } else {
    logger.warn('Component not found at', COMPONENT_PATH);
  }

  const componentDir = path.dirname(COMPONENT_PATH);
  if (fs.existsSync(componentDir)) {
    fs.watch(componentDir, { recursive: true }, async (_, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.ts'))) return;
      const filePath = path.join(componentDir, filename);
      if (!fs.existsSync(filePath)) return;
      logger.info('[reload]', filename);
      try { await reloadComponent(page, COMPONENT_PATH); }
      catch (e) { logger.error('[reload error]', (e as Error).message); }
    });
  }

  page.on('load', async () => {
    const stillInjected = await page.evaluate(() => !!(window as any).__injected).catch(() => false);
    if (!stillInjected) {
      logger.info('Page navigated — reinjecting...');
      await page.evaluate((url: string) => { (window as any).__condenserUrl = url; }, websocketUrl);
      const reResult = await page.evaluate(inject).catch((e: Error) => ({ error: e.message }));
      logger.info('Reinjection:', JSON.stringify(reResult));
      if (fs.existsSync(COMPONENT_PATH)) {
        await reloadComponent(page, COMPONENT_PATH);
      }
    }
  });
}

async function discoverAllBrowsers(
  debugUrls: string[],
  logger: ReturnType<typeof createLogger>,
): Promise<Browser[]> {
  const browsers: Browser[] = [];
  for (const debugUrl of debugUrls) {
    try {
      logger.debug(`Scanning ${debugUrl}...`);
      const response = await fetch(`${debugUrl}/json/version`);
      const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
      });
      logger.info(`Connected to browser at ${debugUrl}`);
      browsers.push(browser);
    } catch {
      continue;
    }
  }
  return browsers;
}

export async function startDiscovery(mode: Mode) {
  const config = getRuntimeConfig(mode);
  const logger = createLogger('target', config.enableDebugLogs);

  const discoverAndSetup = async () => {
    const browsers = await discoverAllBrowsers(config.debugTargets, logger);

    if (browsers.length === 0) {
      logger.warn('No debugger found — launch Steam with -cef-enable-debugging or a browser with remote debugging');
      setTimeout(discoverAndSetup, RECONNECT_INTERVAL_MS);
      return;
    }

    for (const browser of browsers) {
      const page = await findSteamSharedContextPage(browser);
      if (page) {
        await pageSetup(page, config.backendWsOrigin, logger);
      } else {
        logger.warn('SharedJSContext not found — is Steam running in game mode?');
      }

      browser.on('targetcreated', async (target: Target) => {
        if (target.type() !== 'page') return;
        try {
          const newPage = await target.page();
          if (!newPage) return;
          const title = await newPage.title().catch(() => '');
          const url = newPage.url();
          if (isSteamSharedContextTab(title, url)) {
            await pageSetup(newPage, config.backendWsOrigin, logger);
          }
        } catch {}
      });

      browser.once('disconnected', () => {
        logger.info('Browser disconnected, reconnecting in', RECONNECT_INTERVAL_MS / 1000, 's...');
        setTimeout(discoverAndSetup, RECONNECT_INTERVAL_MS);
      });
    }
  };

  discoverAndSetup();
}

// Only auto-start when this file is the direct entry point, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDiscovery(getModeFromArg(process.argv.slice(2)));
}
