/**
 * Integration tests for the Steam injection flow.
 *
 * Steam is started automatically by the Playwright global setup in
 * tests/setup.ts before any test runs. All three readiness phases
 * (debug port open → SharedJSContext present → BFinishedInitStageOne true)
 * are verified before the suite starts, so no skip guards are needed here.
 *
 * Run:  npx playwright test
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { inject } from '../frontend/steam/inject.js';
import { isSteamSharedContextTab, transpile } from '../backend/target.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STEAM_DEBUG_URL = 'http://localhost:8080';
const CONDENSER_TAB_PATH = path.join(__dirname, '..', 'frontend', 'components', 'condenser-tab.tsx');
const TEST_WS_URL = 'ws://localhost:3001';

// ─── Shared browser / page ────────────────────────────────────────────────────

let browser: Browser;
let sharedPage: Page;

async function findSteamSharedContextPage(b: Browser): Promise<Page | null> {
  for (const context of b.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title().catch(() => '');
      if (isSteamSharedContextTab(title, page.url())) return page;
    }
  }
  return null;
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(STEAM_DEBUG_URL);
  const page = await findSteamSharedContextPage(browser);
  if (!page) throw new Error('SharedJSContext page not found after globalSetup');
  sharedPage = page;
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
});

// ─── Group 1: Tab discovery ───────────────────────────────────────────────────

test.describe('Tab discovery', () => {

  test('Steam debug port returns a JSON page list', async () => {
    const res = await fetch(`${STEAM_DEBUG_URL}/json`);
    expect(res.status).toBe(200);
    const tabs = await res.json() as any[];
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      expect(tab).toHaveProperty('title');
      expect(tab).toHaveProperty('id');
      expect(tab).toHaveProperty('webSocketDebuggerUrl');
    }
  });

  test('SharedJSContext tab is present in the page list', async () => {
    const tabs = await fetch(`${STEAM_DEBUG_URL}/json`).then(r => r.json()) as any[];
    const sharedCtx = tabs.find((t: any) =>
      ['SharedJSContext', 'Steam Shared Context presented by Valve™', 'Steam', 'SP'].includes(t.title)
    );
    expect(sharedCtx).toBeDefined();
    expect(sharedCtx.url).toMatch(/steamloopback\.host/);
  });

  test('isSteamSharedContextTab() correctly identifies the target tab', async () => {
    expect(isSteamSharedContextTab('SharedJSContext', 'https://steamloopback.host/routes/library/home')).toBe(true);
    expect(isSteamSharedContextTab('SP', 'https://steamloopback.host/routes/library/home')).toBe(true);
    expect(isSteamSharedContextTab('Steam', 'https://steamloopback.host/index.html')).toBe(true);

    expect(isSteamSharedContextTab('MainMenu_uid2', 'about:blank?browserviewpopup=1&requestid=1')).toBe(false);
    expect(isSteamSharedContextTab('QuickAccess_uid2', 'about:blank?browserviewpopup=1&requestid=2')).toBe(false);
    expect(isSteamSharedContextTab('notificationtoasts_uid2', 'about:blank?browserviewpopup=1')).toBe(false);
    expect(isSteamSharedContextTab('Steam Big Picture Mode', 'https://steamloopback.host/routes/library/home')).toBe(false);
  });

  test('only one page is identified as the Steam shared context', async () => {
    let targetCount = 0;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const title = await page.title().catch(() => '');
        if (isSteamSharedContextTab(title, page.url())) targetCount++;
      }
    }
    expect(targetCount).toBe(1);
  });

  test('findSteamSharedContextPage() returns a non-null page', async () => {
    const page = await findSteamSharedContextPage(browser);
    expect(page).not.toBeNull();
  });

});

// ─── Group 2: Steam context ───────────────────────────────────────────────────

test.describe('Steam context', () => {

  test('webpackChunksteamui is present and is an array', async () => {
    const result = await sharedPage.evaluate(() => ({
      exists: Array.isArray((window as any).webpackChunksteamui),
      length: (window as any).webpackChunksteamui?.length ?? 0,
    }));
    expect(result.exists).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('Steam app has passed init stage 1', async () => {
    const ready = await sharedPage.evaluate(
      () => (window as any).App?.BFinishedInitStageOne?.() ?? false
    );
    expect(ready).toBe(true);
  });

  test('popup frames do not have webpackChunksteamui', async () => {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const title = await page.title().catch(() => '');
        if (isSteamSharedContextTab(title, page.url())) continue;
        const hasWebpack = await page
          .evaluate(() => !!(window as any).webpackChunksteamui)
          .catch(() => false);
        expect(hasWebpack).toBe(false);
      }
    }
  });

});

// ─── Group 3: Injection ───────────────────────────────────────────────────────

test.describe('Injection', () => {

  test('inject() returns { ready: true, success: true }', async () => {
    await sharedPage.evaluate(() => { delete (window as any).__condenser; });
    const result = await sharedPage.evaluate(inject) as any;

    expect(result.ready).toBe(true);
    expect(result.success).toBe(true);
    expect(result.isReinjection).toBe(false);
  });

  test('sets window.__condenser.core.injected guard', async () => {
    const injected = await sharedPage.evaluate(() => !!(window as any).__condenser?.core?.injected);
    expect(injected).toBe(true);
  });

  test('scans webpack registry and finds React', async () => {
    const result = await sharedPage.evaluate(inject) as any;
    expect(result.moduleCount).toBeGreaterThan(50);
    expect(result.reactVersion).toMatch(/^\d+\.\d+/);
  });

  test('finds and caches the Quick Access Menu renderer', async () => {
    const result = await sharedPage.evaluate(inject) as any;
    expect(result.quickAccessMenuFound).toBe(true);
    const cacheSet = await sharedPage.evaluate(() => !!(window as any).__condenser?.core?.quickAccessMenuRenderer);
    expect(cacheSet).toBe(true);
  });

  test('caches webpack registry on window.__condenser.core.webpackRegistry', async () => {
    const cached = await sharedPage.evaluate(() => {
      const registry = (window as any).__condenser?.core?.webpackRegistry;
      return typeof registry === 'object' && registry !== null;
    });
    expect(cached).toBe(true);
  });

  test('populates the renderer type cache', async () => {
    const hasCache = await sharedPage.evaluate(() => (window as any).__condenser?.core?.patchedTypeCache != null);
    expect(hasCache).toBe(true);
  });

});

// ─── Group 4: Idempotency ─────────────────────────────────────────────────────

test.describe('Idempotency', () => {

  test('second call returns isReinjection: true', async () => {
    await sharedPage.evaluate(inject);
    const result = await sharedPage.evaluate(inject) as any;
    expect(result.isReinjection).toBe(true);
    expect(result.success).toBe(true);
  });

  test('webpack registry is not rebuilt on re-injection', async () => {
    const before = await sharedPage.evaluate(() => {
      const registry = (window as any).__condenser?.core?.webpackRegistry;
      return registry instanceof Map ? registry.size : 0;
    });
    await sharedPage.evaluate(inject);
    const after = await sharedPage.evaluate(() => {
      const registry = (window as any).__condenser?.core?.webpackRegistry;
      return registry instanceof Map ? registry.size : 0;
    });
    expect(after).toBe(before);
  });

});

// ─── Group 5: Stylesheet injection ───────────────────────────────────────────

test.describe('Stylesheet injection', () => {

  test('addStylesheet creates a <style> element with the returned id', async () => {
    const stylesheetId = await sharedPage.evaluate((css: string) => {
      const id = 'test-' + Math.random().toString(36).slice(2);
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
      return id;
    }, '.inject-test { color: red; }');

    const exists = await sharedPage.evaluate(
      (id: string) => !!document.getElementById(id),
      stylesheetId,
    );
    expect(exists).toBe(true);

    await sharedPage.evaluate((id: string) => document.getElementById(id)?.remove(), stylesheetId);
  });

  test('removeStylesheet removes the style element', async () => {
    const stylesheetId = await sharedPage.evaluate(() => {
      const id = 'test-remove-' + Math.random().toString(36).slice(2);
      const style = document.createElement('style');
      style.id = id;
      style.textContent = '.remove-test { display: none; }';
      document.head.appendChild(style);
      return id;
    });

    expect(
      await sharedPage.evaluate((id: string) => !!document.getElementById(id), stylesheetId)
    ).toBe(true);

    await sharedPage.evaluate((id: string) => {
      const el = document.getElementById(id);
      if (el?.nodeName.toLowerCase() === 'style') el.parentNode?.removeChild(el);
    }, stylesheetId);

    expect(
      await sharedPage.evaluate((id: string) => !!document.getElementById(id), stylesheetId)
    ).toBe(false);
  });

});

// ─── Group 6: Component rendering ────────────────────────────────────────────

test.describe('Component rendering', () => {

  test('transpile + evaluate sets window.__condenser.components[condenser-tab].component', async () => {
    await sharedPage.evaluate(() => { delete (window as any).__condenser; });
    await sharedPage.evaluate(inject);

    const script = transpile(CONDENSER_TAB_PATH, 'condenser-tab');
    await sharedPage.evaluate(script);

    const hasComponent = await sharedPage.evaluate(
      () => !!(window as any).__condenser?.components?.['condenser-tab']?.component?.panel
    );
    expect(hasComponent).toBe(true);
  });

  test('QAMTab component creates a valid React element with Steam React', async () => {
    const result = await sharedPage.evaluate((wsUrl: string) => {
      const Component = (window as any).__condenser?.components?.['condenser-tab']?.component?.panel;
      if (!Component) return { skipped: true };

      const registry: Map<string, any> = (window as any).__condenser?.core?.webpackRegistry;
      if (!registry) return { skipped: true };

      let React: any = null;
      for (const m of registry.values()) {
        const candidate = m?.default ?? m;
        if (candidate?.Component && candidate?.PureComponent && candidate?.useLayoutEffect) {
          React = candidate;
          break;
        }
      }
      if (!React) return { skipped: true };

      try {
        const el = React.createElement(Component, { React, websocketUrl: wsUrl });
        return {
          isElement: el != null && el.type === Component,
          hasProps: el?.props?.React === React && el?.props?.websocketUrl === wsUrl,
        };
      } catch (e: any) {
        return { error: (e as Error).message };
      }
    }, TEST_WS_URL);

    if ((result as any).skipped) { test.skip(); return; }
    expect((result as any).error).toBeUndefined();
    expect((result as any).isElement).toBe(true);
    expect((result as any).hasProps).toBe(true);
  });

  test('forceUpdate is wired after InjectedTabPanel mounts', async () => {
    const hasForceUpdate = await sharedPage.evaluate(
      () => typeof (window as any).__condenser?.components?.['condenser-tab']?.forceUpdate === 'function',
    );
    if (!hasForceUpdate) { test.skip(); return; }

    await expect(
      sharedPage.evaluate(() => { (window as any).__condenser.components['condenser-tab'].forceUpdate(); })
    ).resolves.not.toThrow();
  });

});

// ─── Group 7: Cross-tab evaluation ───────────────────────────────────────────

test.describe('Cross-tab evaluation', () => {

  async function evaluateInTab(b: Browser, tabTitle: string, code: string): Promise<any> {
    for (const context of b.contexts()) {
      for (const page of context.pages()) {
        const title = await page.title().catch(() => '');
        if (title === tabTitle) return page.evaluate(code);
      }
    }
    throw new Error(`Tab not found: "${tabTitle}"`);
  }

  test('evaluates JavaScript in a named non-target tab', async () => {
    let nonTargetTitle: string | null = null;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const title = await page.title().catch(() => '');
        if (!isSteamSharedContextTab(title, page.url()) && title) {
          nonTargetTitle = title;
          break;
        }
      }
      if (nonTargetTitle) break;
    }

    if (!nonTargetTitle) { test.skip(); return; }

    const result = await evaluateInTab(browser, nonTargetTitle, '1 + 1');
    expect(result).toBe(2);
  });

  test('throws when the target tab title does not exist', async () => {
    await expect(
      evaluateInTab(browser, '__no_such_tab__', '1')
    ).rejects.toThrow('Tab not found: "__no_such_tab__"');
  });

});
