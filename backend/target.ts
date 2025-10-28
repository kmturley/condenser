import puppeteer, { Browser, Page, Target, HTTPRequest, Frame } from 'puppeteer';

const TARGET_URL: string = 'https://store.steampowered.com';
const DOMAIN: string = 'http://localhost:3000';
const CSP_ADDITIONS: string = 'ws://localhost:3000';

export async function startDiscovery() {
  const browser: Browser = await puppeteer.launch({
    defaultViewport: null,
    devtools: true,
    headless: false,
  });
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
      await page.waitForSelector('body');
      await page.evaluate(`
        (() => {
          if (document.getElementById('condenser')) return;

          const a = document.createElement('script');
          a.id = 'vite';
          a.type = 'module';
          a.src = '${DOMAIN}/@vite/client';
          document.head.appendChild(a);

          const el = document.createElement('script');
          el.id = 'condenser';
          el.type = 'module';
          el.src = '${DOMAIN}/index.ts';
          document.head.appendChild(el);
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
