import puppeteer, { Browser, Page, Target, HTTPRequest } from 'puppeteer';
import { createLogger } from '../shared/logger.js';
import { getRuntimeConfig, getModeFromArg, Mode } from '../shared/runtime.js';

interface ChromeVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

const TARGET_URL: string = 'https://store.steampowered.com/';
const TARGET_PAGES: string[] = [
  'Steam Big Picture Mode',
  'Welcome to Steam',
];

export async function startDiscovery(mode: Mode) {
  const config = getRuntimeConfig(mode);
  const logger = createLogger('target', config.enableDebugLogs);
  const browsers = await discoverAllBrowsers(config.debugTargets, config.frontendOrigin, logger);
  if (browsers.length === 0) {
    logger.warn('No debugger found, launch a browser with remote debugging enabled or the Steam app');
    return;
  }

  for (const { browser, domain } of browsers) {
    browser.on('targetcreated', async (target: Target) => {
      logger.debug('Target', target.url());
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) await pageSetup(page, domain, config.connectSrc, config.scriptSrc, logger);
      }
    });

    const pages = await browser.pages();
    const matchingPages = await findAllPages(pages, TARGET_PAGES, logger);
    for (const page of matchingPages) {
      await pageSetup(page, domain, config.connectSrc, config.scriptSrc, logger);
    }
  }
}

async function discoverAllBrowsers(
  debugUrls: string[],
  domain: string,
  logger: ReturnType<typeof createLogger>
): Promise<Array<{ browser: Browser, domain: string }>> {
  const browsers: Array<{ browser: Browser, domain: string }> = [];
  for (const debugUrl of debugUrls) {
    try {
      logger.debug(`Scanning ${debugUrl}...`);
      const browserURL = `${debugUrl}/json/version`;
      const response = await fetch(browserURL);
      const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
      });
      logger.info(`Connected to browser at ${debugUrl}, using domain ${domain}`);
      browsers.push({ browser, domain });
    } catch {
      continue;
    }
  }
  return browsers;
}

async function findAllPages(
  pages: Page[],
  matches: string[],
  logger: ReturnType<typeof createLogger>
): Promise<Page[]> {
  const matchingPages: Page[] = [];
  for (const page of pages) {
    const title = await page.title();
    logger.debug(`Page: ${title}`);
    for (const match of matches) {
      if (title === match) {
        logger.info(`Page match: ${title}`);
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
          }
        })();
      } catch (e) {
        console.error('Condenser setup error:', e);
      }
    })()
  `;
}

async function pageSetup(
  page: Page,
  domain: string,
  connectSrc: string[],
  scriptSrc: string[],
  logger: ReturnType<typeof createLogger>
) {
  // Avoid setting up the same page twice
  if ((page as any)._condenserSetup) return;
  (page as any)._condenserSetup = true;

  logger.debug('Setup', page.url());
  page.setBypassCSP(true);
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    if (request.url().startsWith(domain) || request.url() === TARGET_URL) {
      interceptRequest(request, connectSrc, scriptSrc, logger);
    } else {
      request.continue();
    }
  });

  // Register script for all future navigations
  await page.evaluateOnNewDocument(injectScript(domain));

  // Check if page is already loaded and inject immediately if it is
  const isLoaded = await page.evaluate('document.readyState !== "loading"');
  if (isLoaded) {
    logger.debug('Page already loaded, injecting script now');
    await page.evaluate(injectScript(domain));
  }
}

async function interceptRequest(
  request: HTTPRequest,
  connectSrc: string[],
  scriptSrc: string[],
  logger: ReturnType<typeof createLogger>
) {
  logger.debug('Intercept', request.url());
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    if (request.url().startsWith('https:')) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const response = await fetch(request.url());

    if (response.headers.has('content-security-policy')) {
      logger.debug('Rewriting CSP for injected frontend');
    }

    const headers = updateHeaders(response.headers, connectSrc, scriptSrc);
    await request.respond({
      status: response.status,
      headers,
      contentType: response.headers.get('content-type') || undefined,
      body: await response.text(),
    });
  } catch (error) {
    logger.error('Intercept error', error);
    await request.abort();
  } finally {
    if (originalRejectUnauthorized !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  }
}

function updateHeaders(headers: Headers, connectSrc: string[], scriptSrc: string[]): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-security-policy') {
      let policy = value;
      policy = rewriteCSPDirective(policy, 'connect-src', connectSrc);
      policy = rewriteCSPDirective(policy, 'script-src', scriptSrc);
      modifiedHeaders[key] = policy;
    } else {
      modifiedHeaders[key] = value;
    }
  });
  modifiedHeaders['access-control-allow-origin'] = '*';
  return modifiedHeaders;
}

function rewriteCSPDirective(policy: string, directive: string, sources: string[]): string {
  const value = `${directive} ${sources.join(' ')}`;
  if (policy.includes(`${directive} `)) {
    return policy.replace(new RegExp(`${directive} [^;]+`), value);
  }
  return `${policy}; ${value}`;
}

startDiscovery(getModeFromArg(process.argv.slice(2)));
