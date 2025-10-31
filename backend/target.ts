import puppeteer, { Browser, Page, Target, HTTPRequest, Frame } from 'puppeteer';
import { SERVER_PORT } from './server';

interface ChromeVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

const TARGET_URL: string = 'https://store.steampowered.com';
const DOMAIN: string = 'http://localhost:3000';
// Ports to scan for remote debugging
// 8080 Steam app
// 9222 Chrome
const DEBUG_PORTS: number[] = [8080, 9222];

export async function startDiscovery() {
  const browsers = await discoverAllBrowsers();
  if (browsers.length === 0) {
    console.log('No debugger found, launch a browser with remote debugging enabled or the Steam app');
    return;
  }

  for (const browser of browsers) {
    browser.on('targetcreated', async (target: Target) => {
      console.log('Target', target.url());
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) await pageSetup(page);
      }
    });
    
    const pages = await browser.pages();
    const matchingPages = await findAllPages(pages, ['Welcome to Steam', 'Steam Big Picture Mode']);
    for (const page of matchingPages) {
      await pageSetup(page);
    }
  }
}

async function discoverAllBrowsers(): Promise<Browser[]> {
  const browsers: Browser[] = [];
  for (const port of DEBUG_PORTS) {
    try {
      console.log(`Scanning port ${port}...`);
      const browserURL = `http://localhost:${port}/json/version`;
      const response = await fetch(browserURL);
      const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
      });
      console.log(`Connected to browser on port ${port}`);
      browsers.push(browser);
    } catch (error) {
      continue;
    }
  }
  return browsers;
}

async function findAllPages(pages: Page[], matches: string[]): Promise<Page[]> {
  const matchingPages: Page[] = [];
  for (const page of pages) {
    const title = await page.title();
    console.log(`Page: ${title}`);
    for (const match of matches) {
      if (title === match) {
        console.log(`Page match: ${title}`);
        matchingPages.push(page);
        break;
      }
    }
  }
  return matchingPages.length > 0 ? matchingPages : pages;
}

async function pageSetup(page: Page) {
  console.log('Setup', page.url());
  page.setBypassCSP(true);
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    if (request.url().startsWith(DOMAIN) || request.url().startsWith(TARGET_URL)) {
      interceptRequest(request);
    } else {
      request.continue();
    }
  });
  page.on('framenavigated', async (frame: Frame) => {
    if (frame === page.mainFrame() && frame.url().startsWith(TARGET_URL)) {
      pageInjectScript(page);
    }
  });
  pageInjectScript(page);
}

async function pageInjectScript(page: Page) {
  console.log('Inject', page.url());
  try {
    await page.evaluate(`
      (() => {
        if (document.getElementById('react-refresh')) return;

        const b = document.createElement('script');
        b.id = 'react-refresh';
        b.type = 'module';
        b.innerHTML = 'import { injectIntoGlobalHook } from "${DOMAIN}/@react-refresh"; injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;';
        document.head.appendChild(b);

        const a = document.createElement('script');
        a.id = 'vite';
        a.type = 'module';
        a.src = '${DOMAIN}/@vite/client';
        document.head.appendChild(a);
      })()
    `);
    await page.waitForSelector('body');
    await page.evaluate(`
      (() => {
        if (document.getElementById('condenser')) return;

        const el = document.createElement('script');
        el.id = 'condenser';
        el.type = 'module';
        el.src = '${DOMAIN}/index.tsx';
        document.body.appendChild(el);
      })()
    `);
  } catch (error) {
  }
}

async function interceptRequest(request: HTTPRequest) {
  console.log('Intercept', request.url());
  try {
    const response = await fetch(request.url());
    const headers = updateHeaders(response.headers);
    await request.respond({
      status: response.status,
      headers,
      contentType: response.headers.get('content-type') || undefined,
      body: await response.text(),
    });
  } catch (error) {
    console.error('Intercept error', error);
    await request.abort();
  }
}

function updateHeaders(headers: Headers): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-security-policy') {
      modifiedHeaders[key] = value.replace(
        `connect-src 'self'`,
        `connect-src 'self' ${SERVER_PORT}`
      );
    } else {
      modifiedHeaders[key] = value;
    }
  });
  modifiedHeaders['access-control-allow-origin'] = '*';
  return modifiedHeaders;
}

startDiscovery();
