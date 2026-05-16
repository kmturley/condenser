/// <reference lib="dom" />
import puppeteer, { Browser, Page, Target } from 'puppeteer';
import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../shared/logger.js';

import { getRuntimeConfig, getModeFromArg, Mode } from '../shared/runtime.js';
import { components, pluginsDir } from '../frontend/index.js';

interface ChromeVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

const RECONNECT_INTERVAL_MS = 5_000;

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

export function transpile(filePath: string, id?: string): string {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  });

  if (id !== undefined) {
    return [
      '(function() { const module = { exports: {} }; const exports = module.exports;',
      outputText,
      `const ns = (window.__condenser.components[${JSON.stringify(id)}] ||= {});`,
      'ns.component = module.exports.default ?? module.exports;',
      'ns.forceUpdate?.();',
      '})();',
    ].join('\n');
  }

  return [
    '(function() { const module = { exports: {} }; const exports = module.exports;',
    outputText,
    '})();',
  ].join('\n');
}

function makeBootScript(frontendOrigin: string, wsUrl: string, isProduction = false): string {
  const ext = isProduction ? '.js' : '.ts';
  const bootUrl = `${frontendOrigin}/frontend/steam/boot${ext}`;
  return `(async () => {
    const c = (window.__condenser ||= { core: {}, shared: {}, components: {} });
    c.core.url = ${JSON.stringify(wsUrl)};
    await import(${JSON.stringify(bootUrl)} + '?t=' + Date.now());
  })()`;
}

function makeReloadScript(id: string, pluginUrl: string): string {
  return `(async () => {
    const c = window.__condenser;
    if (c?.shared?.loadPlugin) {
      await c.shared.loadPlugin(${JSON.stringify(id)}, ${JSON.stringify(pluginUrl)} + '?t=' + Date.now(), c);
    }
  })()`;
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
  frontendOrigin: string,
  websocketUrl: string,
  isProduction: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const alreadySetup = await page.evaluate(() => {
    const c: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });
    if (c.core.setup) return true;
    c.core.setup = true;
    return false;
  }).catch(() => false);
  if (alreadySetup) return;

  page.on('console', msg => logger.info('[browser]', msg.text()));
  page.setBypassCSP(true);

  const bootExt = isProduction ? '.js' : '.ts';
  logger.info('Booting via', `${frontendOrigin}/frontend/steam/boot${bootExt}`);
  await page.evaluate(makeBootScript(frontendOrigin, websocketUrl, isProduction))
    .catch((e: Error) => logger.error('Boot error:', e.message));

  logger.info('Watching for changes...');

  // Watch plugins dir — hot reload only the changed plugin
  const componentsByDir = new Map(components.map(c => [c.id, c]));
  if (fs.existsSync(pluginsDir)) {
    fs.watch(pluginsDir, { recursive: true }, async (_, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.ts'))) return;
      const pluginId = filename.split(path.sep)[0];
      const component = componentsByDir.get(pluginId);
      if (!component) return;
      const pluginUrl = `${frontendOrigin}${component.vitePath}`;
      logger.info('[reload]', component.id);
      try {
        await page.evaluate(makeReloadScript(component.id, pluginUrl));
      } catch (e) { logger.error('[reload error]', (e as Error).message); }
    });
  }

  page.on('load', async () => {
    const stillInjected = await page.evaluate(
      () => !!(window as any).__condenser?.core?.injected
    ).catch(() => false);
    if (stillInjected) return;

    await page.evaluate(() => {
      if ((window as any).__condenser) (window as any).__condenser.core.setup = false;
    }).catch(() => {});

    logger.info('Page navigated — reinjecting...');
    await page.evaluate(makeBootScript(frontendOrigin, websocketUrl, isProduction))
      .catch((e: Error) => logger.error('Reinjection error:', e.message));
  });
}

async function discoverAllBrowsers(
  debugUrls: string[],
  logger: ReturnType<typeof createLogger>,
): Promise<Browser[]> {
  const browsers: Browser[] = [];
  const seenEndpoints = new Set<string>();
  for (const debugUrl of debugUrls) {
    try {
      logger.debug(`Scanning ${debugUrl}...`);
      const response = await fetch(`${debugUrl}/json/version`);
      const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
      if (seenEndpoints.has(webSocketDebuggerUrl)) {
        logger.debug(`Skipping duplicate endpoint at ${debugUrl}`);
        continue;
      }
      seenEndpoints.add(webSocketDebuggerUrl);
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
        await pageSetup(page, config.frontendOrigin, config.backendWsOrigin, config.isProduction, logger);
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
            await pageSetup(newPage, config.frontendOrigin, config.backendWsOrigin, config.isProduction, logger);
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
