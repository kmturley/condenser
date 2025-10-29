import puppeteer, { Browser, Page, Target, HTTPRequest, Frame } from 'puppeteer';

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
const CSP_ADDITIONS: string = 'ws://localhost:3000';

export async function startDiscovery(app = false) {
  let browser: Browser;
  if (app) {
    // Connect to existing browser instance
    const browserURL = `http://localhost:8080/json/version`;
    const response = await fetch(browserURL);
    const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
    browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
  } else {
    browser = await puppeteer.launch({
      defaultViewport: null,
      devtools: true,
      headless: false,
    });
  }

  browser.on('targetcreated', async (target: Target) => {
    if (target.type() === 'page') {
      const page = await target.page();
      if (page) await pageSetup(page);
    }
  });
  const pages = await browser.pages();
  await pageSetup(pages[0]);
  await pages[0].goto(TARGET_URL);
}

async function pageSetup(page: Page) {
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
      await page.evaluate(`
        (() => {
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
    }
  });
}

async function interceptRequest(request: HTTPRequest) {
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
    console.error('replaceHeaders error', error);
    await request.abort();
  }
}

function updateHeaders(headers: Headers): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-security-policy') {
      modifiedHeaders[key] = value.replace(
        `connect-src 'self'`,
        `connect-src 'self' ${CSP_ADDITIONS}`
      );
    } else {
      modifiedHeaders[key] = value;
    }
  });
  modifiedHeaders['access-control-allow-origin'] = '*';
  return modifiedHeaders;
}
