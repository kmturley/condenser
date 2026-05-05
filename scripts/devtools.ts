import { spawn } from 'child_process';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REACT_DEVTOOLS_BIN = path.join(__dirname, '..', 'node_modules', '.bin', 'react-devtools');
const REACT_DEVTOOLS_PORT = 8097;
const REACT_DEVTOOLS_URL = `http://localhost:${REACT_DEVTOOLS_PORT}`;
const STEAM_DEVTOOLS_URL = 'http://localhost:8080';
const STEAM_PAGE_MARKER = 'webpackChunksteamui';

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function waitForPort(port: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt(): void {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('timeout', () => { socket.destroy(); retry(); });
      socket.on('error', () => retry());
      socket.connect(port, 'localhost');
    }

    function retry(): void {
      if (Date.now() >= deadline) {
        reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
      } else {
        setTimeout(attempt, 500);
      }
    }

    attempt();
  });
}

function buildInjectionScript(backendScript: string): string {
  return `
if (!window.__rdtInjected) {
  window.__rdtInjected = true;
  Object.defineProperty(window, '__REACT_DEVTOOLS_TARGET_WINDOW__', {
    enumerable: true, configurable: true,
    get() {
      return (window.GamepadNavTree?.m_context?.m_controller || window.FocusNavController)
        ?.m_ActiveContext?.ActiveWindow || window;
    }
  });
  ${backendScript}
}`;
}

async function findSteamPage(browser: Browser): Promise<Page> {
  for (const target of browser.targets()) {
    if (target.type() !== 'page') continue;
    const page = await target.page();
    if (!page) continue;
    const isSteam = await page
      .evaluate((marker) => !!(globalThis as any)[marker], STEAM_PAGE_MARKER)
      .catch(() => false);
    if (isSteam) return page;
  }
  throw new Error('Steam SharedJSContext not found. Is Steam fully loaded?');
}

async function injectDevTools(): Promise<void> {
  const backendScript = await fetchText(REACT_DEVTOOLS_URL);
  const script = buildInjectionScript(backendScript);
  const browser = await puppeteer.connect({ browserURL: STEAM_DEVTOOLS_URL });

  try {
    const page = await findSteamPage(browser);
    await page.evaluateOnNewDocument(script);
    await page.reload();
  } finally {
    browser.disconnect();
  }
}

async function main(): Promise<void> {
  const devToolsProcess = spawn(REACT_DEVTOOLS_BIN, [], { stdio: 'inherit' });
  devToolsProcess.on('error', err => { console.error(err.message); process.exit(1); });

  await waitForPort(REACT_DEVTOOLS_PORT);
  await injectDevTools();

  process.on('SIGINT', () => { devToolsProcess.kill(); process.exit(0); });
  devToolsProcess.on('exit', code => process.exit(code ?? 0));
}

main().catch(err => { console.error(err); process.exit(1); });
