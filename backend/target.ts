import puppeteer, { Browser, Page, Target } from "puppeteer";

const TARGET_URL = "https://store.steampowered.com/";
const DOMAIN: string = "http://localhost:3000";
const CSP_ADDITIONS =
  "https://condenser.app wss://condenser.app ws://localhost:3000";

export async function startDiscovery() {
  const browser = await puppeteer.launch({
    defaultViewport: null,
    devtools: true,
    headless: false,
  });
  browser.on("targetcreated", async (target: Target) => {
    if (target.type() === "page") {
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
  page.on("request", interceptRequest);
  page.on("framenavigated", async (frame) => {
    if (frame === page.mainFrame() && frame.url().startsWith(TARGET_URL)) {
      await page.waitForSelector("body");

      // Modify CSP to allow WebSocket connections
      await page.evaluate(`
        (() => {
          // Add CSP meta tag for WebSocket support
          const existingMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
          if (!existingMeta) {
            const meta = document.createElement('meta');
            meta.httpEquiv = 'Content-Security-Policy';
            meta.content = 'connect-src * ws://localhost:3000 wss://condenser.app';
            document.head.appendChild(meta);
            console.log('Added CSP meta tag for WebSocket support');
          }
          
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

async function interceptRequest(request: any) {
  if (request.url().startsWith(DOMAIN)) {
    try {
      const newUrl = request.url(); //.replace(DOMAIN, 'http://localhost:3000');
      console.log("Redirecting:", request.url(), "->", newUrl);
      const response = await fetch(newUrl);
      const headers = modifiedAccessControlHeaders(response.headers);
      await request.respond({
        status: response.status,
        headers,
        contentType: response.headers.get("content-type"),
        body: await response.text(),
      });
      console.log("Modified modifiedAccessControlHeaders for:", newUrl);
    } catch (error) {
      console.error("Error intercepting request:", error);
      await request.abort();
    }
    return;
  } else if (request.url().startsWith(TARGET_URL)) {
    try {
      const response = await fetch(request.url());
      const headers = modifyCSPHeader(response.headers);
      await request.respond({
        status: response.status,
        headers,
        contentType: response.headers.get("content-type"),
        body: await response.text(),
      });
      console.log("Modified CSP for:", request.url());
    } catch (error) {
      console.error("Error intercepting request:", error);
      await request.abort();
    }
  } else {
    await request.continue();
  }
}

function modifiedAccessControlHeaders(
  headers: Headers
): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    modifiedHeaders[key] = value;
  });
  modifiedHeaders["access-control-allow-origin"] = "*";
  return modifiedHeaders;
}

function modifyCSPHeader(headers: Headers): Record<string, string> {
  const modifiedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-security-policy") {
      modifiedHeaders[key] = value.replace(
        "connect-src 'self'",
        `connect-src 'self' ${CSP_ADDITIONS}`
      );
    } else {
      modifiedHeaders[key] = value;
    }
  });
  return modifiedHeaders;
}
