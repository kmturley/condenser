import puppeteer, { Browser, Page, Target, HTTPRequest, Frame } from 'puppeteer';
import { SERVER_PORT } from './server';
import { networkInterfaces } from 'os';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
  const hasSSL = existsSync(join(process.cwd(), 'certs', 'cert.pem'));
  const protocol = hasSSL ? 'https' : 'http';
  
  return isLocalhost 
    ? `${protocol}://localhost:3000` 
    : `${protocol}://${getLocalIP()}:3000`;
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
  'Steam Big Picture Mode',
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

        // Helper function to check if domain is reachable
        function checkDomainReachable(url) {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url + '/favicon.ico?' + Date.now();
            setTimeout(() => resolve(false), 5000); // 5 second timeout
          });
        }

        // Helper function for timed imports
        function timedImport(url, timeout = 10000) {
          return Promise.race([
            import(url),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Import timeout')), timeout)
            )
          ]);
        }

        (async () => {
          try {
            console.log('Condenser: Checking domain reachability...', '${domain}');

            // First check if the domain is reachable
            const isReachable = await checkDomainReachable('${domain}');
            if (!isReachable) {
              console.warn('Condenser: Domain not reachable, skipping injection');
              return;
            }

            console.log('Condenser: Domain reachable, proceeding with injection');

            // Mark as loaded only after we've confirmed injection will proceed
            window.condenserHasLoaded = true;

            // Try to inject React refresh with timeout
            try {
              await timedImport('${domain}/@react-refresh', 5000).then(module => {
                module.injectIntoGlobalHook(window);
                window.$RefreshReg$ = () => {};
                window.$RefreshSig$ = () => (type) => type;
                console.log('Condenser: React refresh injected');
              });
            } catch (refreshError) {
              console.warn('Condenser: React refresh injection failed:', refreshError.message);
              // Continue without React refresh
            }

            // Inject Vite client
            await timedImport('${domain}/@vite/client', 5000);
            console.log('Condenser: Vite client injected');

            // Inject main app
            await timedImport('${domain}/index.tsx', 5000);
            console.log('Condenser: Main app injected');

          } catch (e) {
            console.error('Condenser injection error:', e);
            // Only reload if it's not a certificate/network error
            if (!e.message.includes('ERR_CERT') &&
                !e.message.includes('Failed to fetch') &&
                !e.message.includes('Import timeout')) {
              console.log('Condenser: Reloading due to non-network error');
              setTimeout(() => window.location.reload(), 1000);
            } else {
              console.warn('Condenser: Network/certificate error, not reloading');
            }
          }
        })();
      } catch (e) {
        console.error('Condenser setup error:', e);
      }
    })()
  `;
}

async function pageSetup(page: Page, domain: string) {
  try {
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
      try {
        console.log('DOM content loaded, injecting scripts...');
        await page.evaluate(injectScript(domain));
      } catch (injectError) {
        console.error('Failed to inject scripts on DOM content event:', injectError);
      }
    });

    await page.evaluate(injectScript(domain));
  } catch (setupError) {
    console.error('Page setup failed:', setupError);
  }
}

async function interceptRequest(request: HTTPRequest) {
  try {
    console.log('Intercept', request.url());
    // Temporarily disable SSL verification for self-signed certificates
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (request.url().startsWith('https:')) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const response = await fetch(request.url());

    // Restore original setting
    if (originalRejectUnauthorized !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }

    const headers = updateHeaders(response.headers);
    await request.respond({
      status: response.status,
      headers,
      contentType: response.headers.get('content-type') || undefined,
      body: await response.text(),
    });
  } catch (error) {
    console.error('Intercept error', error);
    try {
      await request.abort();
    } catch (abortError) {
      console.error('Failed to abort request:', abortError);
    }
  }
}

function updateHeaders(headers: Headers): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-security-policy') {
      modifiedHeaders[key] = value.replace(
        `connect-src 'self'`,
        `connect-src 'self' ws://localhost:3000 wss://localhost:3000 ws://localhost:3001 wss://localhost:3001`
      );
    } else {
      modifiedHeaders[key] = value;
    }
  });
  modifiedHeaders['access-control-allow-origin'] = '*';
  return modifiedHeaders;
}

startDiscovery();
