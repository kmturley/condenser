/**
 * Playwright global setup — launches Steam if it is not already running,
 * then blocks until the three readiness phases complete:
 *
 *   Phase 1 — CEF debug port (localhost:8080) accepts connections
 *   Phase 2 — SharedJSContext tab appears in /json
 *   Phase 3 — App.BFinishedInitStageOne() returns true inside that tab
 */

import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isSteamSharedContextTab } from '../backend/target.js';

const STEAM_DEBUG_URL = 'http://localhost:8080';
const POLL_MS = 1_000;
const PHASE_TIMEOUT_MS = 90_000;

function findSteamExecutable(): { command: string; args: string[] } | null {
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Steam.app/Contents/MacOS/steam_osx',
      join(homedir(), 'Applications', 'Steam.app', 'Contents', 'MacOS', 'steam_osx'),
    ];
    const match = candidates.find(existsSync);
    return match ? { command: match, args: [] } : null;
  }

  if (process.platform === 'win32') {
    const candidates = [
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Steam', 'steam.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Steam', 'steam.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Steam', 'steam.exe'),
      'steam.exe',
    ].filter(Boolean);
    const match = candidates.find(c => c === 'steam.exe' || existsSync(c));
    return match ? { command: match, args: [] } : null;
  }

  const candidates = [
    '/usr/bin/steam',
    '/usr/local/bin/steam',
    join(homedir(), '.local', 'share', 'Steam', 'steam.sh'),
    'steam',
  ];
  const match = candidates.find(c => c === 'steam' || existsSync(c));
  return match ? { command: match, args: [] } : null;
}

async function isDebugPortOpen(): Promise<boolean> {
  try {
    const res = await fetch(`${STEAM_DEBUG_URL}/json`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function hasSharedCtxTab(): Promise<boolean> {
  try {
    const tabs = await fetch(`${STEAM_DEBUG_URL}/json`).then(r => r.json()) as any[];
    return tabs.some(t => isSteamSharedContextTab(t.title ?? '', t.url ?? ''));
  } catch {
    return false;
  }
}

async function poll(
  label: string,
  condition: () => Promise<boolean>,
  timeoutMs: number = PHASE_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition().catch(() => false)) return;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(`[setup] Timed out after ${timeoutMs / 1000}s waiting for: ${label}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (await isDebugPortOpen()) {
    console.log('[setup] Steam is already running — skipping launch.');
  } else {
    const exe = findSteamExecutable();
    if (!exe) {
      throw new Error('[setup] Steam executable not found. Install Steam in the default location.');
    }
    const launchArgs = [...exe.args, '-dev', '-windowed', '-cef-enable-debugging', '-gamepadui'];
    console.log('[setup] Launching Steam:', exe.command, launchArgs.join(' '));
    const child = spawn(exe.command, launchArgs, { detached: true, stdio: 'ignore' });
    child.unref();
  }

  console.log('[setup] Phase 1 — waiting for CEF debug port at', STEAM_DEBUG_URL);
  await poll('CEF debug port open', isDebugPortOpen);
  console.log('[setup] Phase 1 — debug port is open.');

  console.log('[setup] Phase 2 — waiting for SharedJSContext tab...');
  await poll('SharedJSContext tab in /json', hasSharedCtxTab);
  console.log('[setup] Phase 2 — SharedJSContext tab found.');

  console.log('[setup] Phase 3 — waiting for Steam app init (BFinishedInitStageOne)...');
  const browser = await chromium.connectOverCDP(STEAM_DEBUG_URL);
  try {
    await poll('BFinishedInitStageOne()', async () => {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          const title = await page.title().catch(() => '');
          if (!isSteamSharedContextTab(title, page.url())) continue;
          return page
            .evaluate(() => (window as any).App?.BFinishedInitStageOne?.() ?? false)
            .catch(() => false);
        }
      }
      return false;
    }, 30_000);
  } finally {
    await browser.close();
  }
  console.log('[setup] Phase 3 — Steam is fully initialized and ready.');
}
