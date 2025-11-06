import puppeteer, { Browser, Page, Target, HTTPRequest, Frame } from 'puppeteer';
import { SERVER_PORT } from './server';
import { networkInterfaces } from 'os';

interface ChromeVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

const TARGET_URL: string = 'https://store.steampowered.com/';

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function getDomain(debugUrl: string): string {
  const isLocalhost = debugUrl.includes('localhost') || debugUrl.includes('127.0.0.1');
  return isLocalhost ? 'http://localhost:3000' : `http://${getLocalIP()}:3000`;
}
// URLs to scan for remote debugging
// 8080 Steam app
// 9222 Chrome
const DEBUG_URLS: string[] = [
  'http://localhost:8080',
  'http://localhost:9222',
  'http://steamdeck:8081'
];
const TARGET_PAGES: string[] = [
  'SharedJSContext',
  'Welcome to Steam',
];

export async function startDiscovery() {
  const browsers = await discoverAllBrowsers();
  if (browsers.length === 0) {
    console.log('No debugger found, launch a browser with remote debugging enabled or the Steam app');
    return;
  }

  for (const { browser, domain } of browsers) {
    browser.on('targetcreated', async (target: Target) => {
      console.log('Target', target.url());
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) await pageSetup(page, domain);
      }
    });
    
    const pages = await browser.pages();
    const matchingPages = await findAllPages(pages, TARGET_PAGES);
    for (const page of matchingPages) {
      await pageSetup(page, domain);
    }
  }
}

async function discoverAllBrowsers(): Promise<Array<{ browser: Browser, domain: string }>> {
  const browsers: Array<{ browser: Browser, domain: string }> = [];
  for (const debugUrl of DEBUG_URLS) {
    try {
      console.log(`Scanning ${debugUrl}...`);
      const browserURL = `${debugUrl}/json/version`;
      const response = await fetch(browserURL);
      const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
      });
      const domain = getDomain(debugUrl);
      console.log(`Connected to browser at ${debugUrl}, using domain ${domain}`);
      browsers.push({ browser, domain });
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

function injectScript(domain: string) {
  return `
    (() => {
      try {
        if (window.condenserHasLoaded) return;
        window.condenserHasLoaded = true;
        (async () => {
          try {
            await import('${domain}/@react-refresh').then(module => {
              module.injectIntoGlobalHook(window);
              window.$RefreshReg$ = () => {};
              window.$RefreshSig$ = () => (type) => type;
            });
            await import('${domain}/@vite/client');
            await import('${domain}/index.tsx');
          } catch (e) {
            console.error('Condenser injection error:', e);
            window.location.reload();
          }
        })();
      } catch (e) {
        console.error('Condenser setup error:', e);
      }
    })()
  `;
}

async function pageSetup(page: Page, domain: string) {
  console.log('Setup', page.url());
  page.setBypassCSP(true);
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    if (request.url().startsWith(domain) || request.url() === TARGET_URL) {
      interceptRequest(request);
    } else {
      request.continue();
    }
  });

  const client = await page.createCDPSession();
  await client.send('Page.enable');
  client.on('Page.domContentEventFired', async () => {
    console.log('DOM content loaded, injecting scripts...');
    await page.evaluate(injectScript(domain));
  });

  await page.evaluate(injectScript(domain));
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
