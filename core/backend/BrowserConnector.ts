import puppeteer, { Browser, Page, Target, HTTPRequest } from 'puppeteer';
import { PluginManager } from './PluginManager';
import { networkInterfaces } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';

interface ChromeVersionInfo {
  webSocketDebuggerUrl: string;
}

const TARGET_URL = 'https://store.steampowered.com/';

export class BrowserConnector {
  constructor(private debugUrls: string[]) {}

  async startDiscovery(pluginManager: PluginManager): Promise<void> {
    const browsers = await this.discoverAllBrowsers();
    console.log(`Discovered ${browsers.length} browsers`);
    if (browsers.length === 0) {
      console.log('No debugger found, launch a browser with remote debugging enabled');
      return;
    }

    for (const { browser, domain } of browsers) {
      browser.on('targetcreated', async (target: Target) => {
        if (target.type() === 'page') {
          const page = await target.page();
          if (page) await this.setupPage(page, domain, pluginManager);
        }
      });
      
      const pages = await browser.pages();
      const validPages = pages.filter(page => !page.isClosed());
      for (const page of validPages) {
        if (!page.isClosed()) {
          await this.setupPage(page, domain, pluginManager);
        }
      }
    }
  }

  private async discoverAllBrowsers(): Promise<Array<{ browser: Browser, domain: string }>> {
    const browsers: Array<{ browser: Browser, domain: string }> = [];
    
    for (const debugUrl of this.debugUrls) {
      try {
        const browserURL = `${debugUrl}/json/version`;
        const response = await fetch(browserURL);
        const { webSocketDebuggerUrl } = await response.json() as ChromeVersionInfo;
        const browser = await puppeteer.connect({
          browserWSEndpoint: webSocketDebuggerUrl,
          defaultViewport: null,
        });
        const domain = this.getDomain(debugUrl);
        browsers.push({ browser, domain });
      } catch (error) {
        continue;
      }
    }
    return browsers;
  }

  private getDomain(debugUrl: string): string {
    const isLocalhost = debugUrl.includes('localhost') || debugUrl.includes('127.0.0.1');
    const hasSSL = existsSync(join(process.cwd(), 'certs', 'cert.pem'));
    const protocol = hasSSL ? 'https' : 'http';
    
    return isLocalhost 
      ? `${protocol}://localhost:3000` 
      : `${protocol}://${this.getLocalIP()}:3000`;
  }

  private getLocalIP(): string {
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

  private async setupPage(page: Page, domain: string, pluginManager: PluginManager): Promise<void> {
    try {
      if (page.isClosed()) return;
      
      // Wait a bit for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (page.isClosed()) return;
      
      const url = page.url();
      const title = await page.title();
      const matchingPlugins = pluginManager.getMatchingPlugins(url, title);
    
    console.log(`Page: ${url} - Title: ${title}`);
    console.log(`Matching plugins: ${matchingPlugins.map(p => p.name).join(', ')}`);
    
    if (matchingPlugins.length === 0) return;

    page.setBypassCSP(true);
    await page.setRequestInterception(true);
    
    page.on('request', (request: HTTPRequest) => {
      if (request.url().startsWith(domain) || request.url() === TARGET_URL) {
        this.interceptRequest(request);
      } else {
        request.continue();
      }
    });

    const client = await page.createCDPSession();
    await client.send('Page.enable');
    client.on('Page.domContentEventFired', async () => {
      console.log('DOM content loaded, injecting scripts...');
      await page.evaluate(this.createInjectionScript(domain, matchingPlugins));
    });

    await page.evaluate(this.createInjectionScript(domain, matchingPlugins));
    } catch (error) {
      console.error('Failed to setup page:', error);
    }
  }

  private createInjectionScript(domain: string, plugins: any[]): string {
    const pluginNames = plugins.map(p => p.name).join(',');
    return `
      (() => {
        try {
          if (window.condenserHasLoaded) return;
          window.condenserHasLoaded = true;
          window.condenserPlugins = '${pluginNames}';
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

  private async interceptRequest(request: HTTPRequest): Promise<void> {
    try {
      const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (request.url().startsWith('https:')) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }
      
      const response = await fetch(request.url());
      
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
      
      const headers = this.updateHeaders(response.headers);
      await request.respond({
        status: response.status,
        headers,
        contentType: response.headers.get('content-type') || undefined,
        body: await response.text(),
      });
    } catch (error) {
      await request.abort();
    }
  }

  private updateHeaders(headers: Headers): Record<string, string> {
    const modifiedHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-security-policy') {
        modifiedHeaders[key] = value
          .replace(`connect-src 'self'`, `connect-src 'self' ws://localhost:3000 wss://localhost:3000 ws://localhost:3001 wss://localhost:3001`)
          .replace(`script-src 'self'`, `script-src 'self' https://localhost:3000`);
      } else {
        modifiedHeaders[key] = value;
      }
    });
    modifiedHeaders['access-control-allow-origin'] = '*';
    return modifiedHeaders;
  }
}