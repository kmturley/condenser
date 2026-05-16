/**
 * Phase 1 proof-of-concept: native ESM dynamic import inside Steam's SharedJSContext.
 *
 * Spins up a tiny in-process HTTP server so the test is fully self-contained
 * (no Vite dev server required). Verifies that:
 *   1. await import('http://localhost/...') works natively — no CSP bypass needed.
 *      Steam's CEF browser does not block localhost HTTP imports from an HTTPS page.
 *   2. Timestamp cache-busting (?t=N) causes a fresh network fetch each time.
 *   3. Exported values from the dynamic module are accessible in the evaluate context.
 *
 * Note: page.setBypassCSP() is Puppeteer-only and not available on Playwright CDP
 * connections. It is already called via Puppeteer in backend/target.ts for the
 * backend's own page handle, but is not required for ESM imports from localhost.
 *
 * Run alongside the existing suite:  npx playwright test
 */

import * as http from 'http';
import { test, expect, chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { isSteamSharedContextTab } from '../backend/target.js';

const STEAM_DEBUG_URL = 'http://localhost:8080';

let browser: Browser;
let sharedPage: Page;
let testServer: http.Server;
let testServerPort: number;
let fetchCount = 0;

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
  // Inline HTTP server — responds with a minimal ESM module and counts requests.
  await new Promise<void>((resolve) => {
    testServer = http.createServer((_req, res) => {
      fetchCount++;
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(`export const ok = true; export const fetchCount = ${fetchCount};`);
    });
    testServer.listen(0, '127.0.0.1', () => {
      testServerPort = (testServer.address() as { port: number }).port;
      resolve();
    });
  });

  browser = await chromium.connectOverCDP(STEAM_DEBUG_URL);
  const page = await findSteamSharedContextPage(browser);
  if (!page) throw new Error('SharedJSContext page not found after globalSetup');
  sharedPage = page;
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
  await new Promise<void>((resolve) => testServer?.close(() => resolve()));
});

// ─── Group 8: Native ESM import ──────────────────────────────────────────────

test.describe('Native ESM import', () => {

  test('dynamic import() from localhost HTTP works without CSP bypass', async () => {
    const url = `http://127.0.0.1:${testServerPort}/test.js?t=${Date.now()}`;
    const result = await sharedPage.evaluate(async (moduleUrl: string) => {
      try {
        const mod = await import(moduleUrl);
        return { ok: (mod as any).ok, error: null };
      } catch (e: any) {
        return { ok: false, error: String(e) };
      }
    }, url);

    expect(result.error, `import() threw: ${result.error}`).toBeNull();
    expect(result.ok).toBe(true);
  });

  test('timestamp cache-bust causes a new fetch on each import', async () => {
    const base = `http://127.0.0.1:${testServerPort}/test.js`;
    const countBefore = fetchCount;

    await sharedPage.evaluate(async (url: string) => { await import(url); }, `${base}?t=1`);
    await sharedPage.evaluate(async (url: string) => { await import(url); }, `${base}?t=2`);

    // Each unique URL should trigger a new network request.
    expect(fetchCount).toBeGreaterThan(countBefore + 1);
  });

  test('exported values from the dynamic module are accessible', async () => {
    const url = `http://127.0.0.1:${testServerPort}/test.js?t=${Date.now()}`;
    const result = await sharedPage.evaluate(async (moduleUrl: string) => {
      try {
        const mod = await import(moduleUrl);
        return {
          ok: (mod as any).ok,
          fetchCount: (mod as any).fetchCount,
          error: null,
        };
      } catch (e: any) {
        return { ok: false, fetchCount: -1, error: String(e) };
      }
    }, url);

    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(typeof result.fetchCount).toBe('number');
    expect(result.fetchCount).toBeGreaterThan(0);
  });

});
