/**
 * Condenser debug CLI — connect to the running Steam app via CDP and run
 * targeted diagnostics without writing one-off scripts.
 *
 * Usage:  tsx scripts/debug.ts <command> [options]
 *
 * Commands:
 *   status                     Check if Steam + Condenser are running
 *   targets                    List all available CDP debug targets
 *   eval <expr> [--target <t>] Evaluate JS in SharedJSContext (or named target)
 *   errors [--target <t>]      Capture and print console errors
 *   condenser                  Dump full Condenser runtime state
 *   react                      Dump React version and component info
 *   render <pluginId>          Test-render a plugin panel, surface any React error
 *   styles <selector> [--target <t>]  Dump computed styles for a CSS selector
 *   webpack <pattern>          Search webpack module sources for a string pattern
 */

import * as http from 'http';
import WebSocket from 'ws';

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEBUG_PORTS = [8080, 9222];
const CONNECT_TIMEOUT_MS = 5_000;
const EVAL_TIMEOUT_MS = 10_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface CdpResult {
  id: number;
  result?: { result: { type: string; value?: any; description?: string; subtype?: string } };
  error?: { message: string };
}

// ─── CDP Client ────────────────────────────────────────────────────────────────

class CdpClient {
  private ws!: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, ((params: any) => void)[]>();

  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error(`CDP connect timed out: ${wsUrl}`)), CONNECT_TIMEOUT_MS);
      this.ws.on('open', () => { clearTimeout(timer); resolve(); });
      this.ws.on('error', (e) => { clearTimeout(timer); reject(e); });
      this.ws.on('message', (raw) => {
        const msg: CdpResult & { method?: string; params?: any } = JSON.parse(raw.toString());
        if (msg.method) {
          for (const handler of this.eventHandlers.get(msg.method) ?? []) handler(msg.params);
        } else if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
          }
        }
      });
    });
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, EVAL_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: (params: any) => void): void {
    const list = this.eventHandlers.get(event) ?? [];
    list.push(handler);
    this.eventHandlers.set(event, list);
  }

  close(): void {
    this.ws.close();
  }
}

// ─── Steam / CDP helpers ───────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c: string) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function findDebugEndpoint(): Promise<string> {
  for (const port of DEBUG_PORTS) {
    try {
      await fetchJson(`http://localhost:${port}/json/version`);
      return `http://localhost:${port}`;
    } catch {
      // try next port
    }
  }
  throw new Error(
    'Steam is not running with remote debugging enabled.\n' +
    'Launch it with:  npm run app',
  );
}

async function listTargets(endpoint: string): Promise<CdpTarget[]> {
  return fetchJson(`${endpoint}/json/list`);
}

function findSharedContext(targets: CdpTarget[]): CdpTarget {
  const SHARED_TITLES = new Set(['SharedJSContext', 'Steam Shared Context presented by Valve™', 'Steam', 'SP']);
  const match = targets.find(
    (t) =>
      t.type === 'page' &&
      SHARED_TITLES.has(t.title) &&
      (t.url.includes('steamloopback.host/routes/') || t.url.includes('steamloopback.host/index.html')),
  );
  if (!match) throw new Error('SharedJSContext not found. Is Steam fully loaded?');
  return match;
}

function findTargetByTitle(targets: CdpTarget[], title: string): CdpTarget {
  const match = targets.find((t) => t.title.toLowerCase().includes(title.toLowerCase()));
  if (!match) throw new Error(`No target found matching: "${title}"\nAvailable: ${targets.map((t) => t.title).join(', ')}`);
  return match;
}

async function openClient(wsUrl: string): Promise<CdpClient> {
  const client = new CdpClient();
  await client.connect(wsUrl);
  await client.send('Runtime.enable');
  return client;
}

async function evaluate<T = any>(client: CdpClient, expression: string): Promise<T> {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: EVAL_TIMEOUT_MS,
  });
  if (result?.result?.subtype === 'error') {
    throw new Error(result.result.description ?? 'Unknown JS error');
  }
  return result?.result?.value as T;
}

// ─── Commands ──────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const ctx = findSharedContext(targets);
  const client = await openClient(ctx.webSocketDebuggerUrl);

  try {
    const state = await evaluate<any>(client, `JSON.stringify({
      booted:       !!(window.__condenser?.core?.booted),
      reactVersion: window.__condenser?.core?.React?.version ?? null,
      patched:      !!(window.__condenser?.core?.patched),
      wsUrl:        window.__condenser?.core?.url ?? null,
      plugins:      Object.keys(window.__condenser?.components ?? {}),
      hasQAM:       !!(window.__condenser?.core?.quickAccessMenuRenderer),
    })`);

    const s = JSON.parse(state);
    console.log('Steam CDP:', endpoint);
    console.log('Target:  ', ctx.title, '@', ctx.url);
    console.log('');
    console.log('Condenser booted:', s.booted ? '✓' : '✗');
    console.log('React version:   ', s.reactVersion ?? '(not found)');
    console.log('QAM patched:     ', s.patched ? '✓' : '✗');
    console.log('Backend WS:      ', s.wsUrl ?? '(not set)');
    console.log('Plugins loaded:  ', s.plugins.length ? s.plugins.join(', ') : '(none)');
    console.log('QAM renderer:    ', s.hasQAM ? '✓' : '✗');
  } finally {
    client.close();
  }
}

async function cmdTargets(): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);

  console.log(`CDP endpoint: ${endpoint}`);
  console.log(`${targets.length} target(s):\n`);
  for (const t of targets) {
    console.log(`  [${t.type}] ${t.title}`);
    console.log(`          ${t.url}`);
    console.log(`          ${t.webSocketDebuggerUrl}`);
    console.log('');
  }
}

async function cmdEval(expression: string, targetTitle?: string): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = targetTitle ? findTargetByTitle(targets, targetTitle) : findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: EVAL_TIMEOUT_MS,
    });
    const r = result?.result;
    if (r?.subtype === 'error') {
      console.error('JS Error:', r.description);
      process.exit(1);
    }
    if (r?.value !== undefined) {
      console.log(typeof r.value === 'object' ? JSON.stringify(r.value, null, 2) : r.value);
    } else {
      console.log(`(${r?.type ?? 'undefined'})`);
    }
  } finally {
    client.close();
  }
}

async function cmdErrors(targetTitle?: string): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = targetTitle ? findTargetByTitle(targets, targetTitle) : findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  const errors: string[] = [];

  try {
    await client.send('Log.enable');
    client.on('Log.entryAdded', (params: any) => {
      if (params.entry.level === 'error') errors.push(params.entry.text);
    });

    // Flush existing exceptions via Runtime.exceptionThrown
    await client.send('Runtime.setAsyncCallStackDepth', { maxDepth: 8 });

    const consoleErrors = await evaluate<string>(client, `JSON.stringify(
      window.__condenser_debugErrors ?? []
    )`);

    // Install a live error collector for new errors
    await evaluate<string>(client, `
      window.__condenser_debugErrors ??= [];
      const orig = console.error.bind(console);
      console.error = (...args) => {
        window.__condenser_debugErrors.push(args.map(String).join(' '));
        orig(...args);
      };
      'installed'
    `);

    console.log(`Target: ${target.title}\n`);

    const prior = JSON.parse(consoleErrors) as string[];
    if (prior.length) {
      console.log('Prior console.error calls captured:');
      prior.forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
    } else {
      console.log('No prior errors captured.');
    }

    if (errors.length) {
      console.log('\nLog-level errors:');
      errors.forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
    }
  } finally {
    client.close();
  }
}

async function cmdCondenser(): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const raw = await evaluate<string>(client, `JSON.stringify({
      booted:            !!(window.__condenser?.core?.booted),
      setup:             !!(window.__condenser?.core?.setup),
      patched:           !!(window.__condenser?.core?.patched),
      csrfToken:         window.__condenser?.core?.csrfToken ? '(set)' : '(not set)',
      wsUrl:             window.__condenser?.core?.url ?? null,
      reactVersion:      window.__condenser?.core?.React?.version ?? null,
      hasReactDOM:       !!(window.__condenser?.core?.ReactDOM),
      hasQAMRenderer:    !!(window.__condenser?.core?.quickAccessMenuRenderer),
      patchedTypeCache:  window.__condenser?.core?.patchedTypeCache?.size ?? 0,
      webpackModules:    window.__condenser?.core?.webpackRegistry?.size ?? 0,
      components: Object.fromEntries(
        Object.entries(window.__condenser?.components ?? {}).map(([id, ns]) => [id, {
          hasComponent:    !!(ns?.component),
          target:          ns?.component?.target ?? null,
          key:             ns?.component?.key ?? null,
          hasPanel:        !!(ns?.component?.panel),
          hasForceUpdate:  typeof ns?.forceUpdate === 'function',
        }])
      ),
    })`);
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
  } finally {
    client.close();
  }
}

async function cmdReact(): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const raw = await evaluate<string>(client, `JSON.stringify((() => {
      const React = window.__condenser?.core?.React;
      if (!React) return { error: 'React not found in condenser.core' };

      // Walk fiber tree from root to count nodes by type
      const rootEl = document.getElementById('root');
      if (!rootEl) return { reactVersion: React.version, error: 'no #root element' };

      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactContainer'));
      const fiberRoot = fiberKey ? rootEl[fiberKey] : null;

      let functionComponents = 0, classComponents = 0, hostNodes = 0, depth = 0, maxDepth = 0;

      function walk(fiber, d) {
        if (!fiber) return;
        maxDepth = Math.max(maxDepth, d);
        if (typeof fiber.type === 'function') {
          fiber.type.prototype?.isReactComponent ? classComponents++ : functionComponents++;
        } else if (typeof fiber.type === 'string') {
          hostNodes++;
        }
        walk(fiber.child, d + 1);
        walk(fiber.sibling, d);
      }
      if (fiberRoot) walk(fiberRoot, 0);

      return {
        version:            React.version,
        functionComponents,
        classComponents,
        hostNodes,
        maxFiberDepth:      maxDepth,
        hasCreateRoot:      typeof React?.version >= '18',
        hasConcurrentMode:  !!(window.__condenser?.core?.ReactDOM?.createRoot),
      };
    })())`);
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
  } finally {
    client.close();
  }
}

async function cmdRender(pluginId: string): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const raw = await evaluate<string>(client, `new Promise((resolve) => {
        const c = window.__condenser;
        const React = c?.core?.React;
        const ReactDOM = c?.core?.ReactDOM;
        const ns = c?.components?.[${JSON.stringify(pluginId)}];

        if (!React)   return resolve(JSON.stringify({ error: 'React not available' }));
        if (!ReactDOM?.createRoot) return resolve(JSON.stringify({ error: 'ReactDOM.createRoot not available' }));
        if (!ns?.component?.panel) return resolve(JSON.stringify({
          error: 'Plugin not found or has no panel',
          availablePlugins: Object.keys(c?.components ?? {}),
        }));

        const Panel = ns.component.panel;
        window.__render_error = null;

        class Boundary extends React.Component {
          constructor(p) { super(p); this.state = { err: null }; }
          static getDerivedStateFromError(e) { return { err: e }; }
          componentDidCatch(e, info) {
            window.__render_error = { message: e.message, stack: e.stack, componentStack: info?.componentStack };
          }
          render() {
            if (this.state.err) return React.createElement('div', null, 'Error');
            return this.props.children;
          }
        }

        const div = document.createElement('div');
        div.id = '__condenser_render_test';
        document.body.appendChild(div);

        const root = ReactDOM.createRoot(div);
        root.render(React.createElement(Boundary, null,
          React.createElement(Panel, { websocketUrl: c.core.url })));

        setTimeout(() => {
          const content = div.textContent?.slice(0, 200) ?? '';
          const err = window.__render_error;
          root.unmount();
          div.remove();
          resolve(JSON.stringify({
            success: !err,
            renderedText: content,
            error: err ? err.message : null,
            stack: err ? err.stack?.split('\\n').slice(0, 8).join('\\n') : null,
            componentStack: err ? err.componentStack?.split('\\n').slice(0, 6).join('\\n') : null,
          }));
        }, 600);
      })`);


    const result = JSON.parse(raw as unknown as string);
    if (result.success) {
      console.log(`✓ Plugin "${pluginId}" rendered without errors`);
      console.log('  Rendered text:', result.renderedText || '(empty)');
    } else {
      console.error(`✗ Plugin "${pluginId}" threw a React error:`);
      console.error('  Message:', result.error);
      if (result.stack) console.error('  Stack:\n   ', result.stack.replace(/\n/g, '\n    '));
      if (result.componentStack) console.error('  Component stack:\n   ', result.componentStack.replace(/\n/g, '\n    '));
      process.exit(1);
    }
  } finally {
    client.close();
  }
}

async function cmdStyles(selector: string, targetTitle?: string): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = targetTitle ? findTargetByTitle(targets, targetTitle) : findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const raw = await evaluate<string>(client, `JSON.stringify((() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'No element matches: ' + ${JSON.stringify(selector)} };

      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const styleProps = [
        'display','visibility','opacity','position','top','left','width','height',
        'margin','padding','background','color','font-size','font-family',
        'border','border-radius','box-shadow','z-index','overflow','flex',
        'align-items','justify-content','pointer-events',
      ];

      return {
        tagName:   el.tagName.toLowerCase(),
        className: el.className,
        rect:      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles:    Object.fromEntries(styleProps.map(p => [p, computed.getPropertyValue(p)])),
        cssVars:   Array.from(document.styleSheets).flatMap(ss => {
          try {
            return Array.from(ss.cssRules).filter(r => r.cssText.includes('--')).map(r => r.cssText.slice(0,120));
          } catch { return []; }
        }).slice(0, 10),
      };
    })())`);
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
  } finally {
    client.close();
  }
}

async function cmdWebpack(pattern: string): Promise<void> {
  const endpoint = await findDebugEndpoint();
  const targets = await listTargets(endpoint);
  const target = findSharedContext(targets);
  const client = await openClient(target.webSocketDebuggerUrl);

  try {
    const raw = await evaluate<string>(client, `JSON.stringify((() => {
      const chunkArray = window.webpackChunksteamui;
      if (!chunkArray) return { error: 'webpackChunksteamui not found' };
      let wr;
      chunkArray.push([[Symbol('condenser:probe')], {}, (r) => { wr = r; }]);
      if (!wr) return { error: 'Failed to capture webpack require' };

      const pattern = ${JSON.stringify(pattern)};
      const matches = [];
      for (const [id, fn] of Object.entries(wr.m)) {
        const src = fn.toString();
        if (src.includes(pattern)) {
          const idx = src.indexOf(pattern);
          matches.push({
            moduleId: id,
            snippet:  src.slice(Math.max(0, idx - 60), idx + pattern.length + 80).replace(/\\s+/g, ' '),
          });
          if (matches.length >= 10) break;
        }
      }
      return { pattern, matchCount: matches.length, matches };
    })())`);
    const result = JSON.parse(raw);
    if (result.error) {
      console.error('Error:', result.error);
      process.exit(1);
    }
    console.log(`Pattern "${result.pattern}" — ${result.matchCount} match(es):\n`);
    for (const m of result.matches) {
      console.log(`  Module ${m.moduleId}:`);
      console.log(`    ...${m.snippet}...`);
      console.log('');
    }
  } finally {
    client.close();
  }
}

// ─── CLI entry ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { command: string; args: string[]; target?: string } {
  const args = argv.slice(2);
  const targetIdx = args.indexOf('--target');
  let target: string | undefined;
  if (targetIdx !== -1) {
    target = args[targetIdx + 1];
    args.splice(targetIdx, 2);
  }
  return { command: args[0] ?? 'status', args: args.slice(1), target };
}

async function main(): Promise<void> {
  const { command, args, target } = parseArgs(process.argv);

  const COMMANDS: Record<string, () => Promise<void>> = {
    status:  () => cmdStatus(),
    targets: () => cmdTargets(),
    eval:    () => cmdEval(args.join(' ') || '42', target),
    errors:  () => cmdErrors(target),
    condenser: () => cmdCondenser(),
    react:   () => cmdReact(),
    render:  () => cmdRender(args[0] ?? 'condenser-tab'),
    styles:  () => cmdStyles(args[0] ?? 'body', target),
    webpack: () => cmdWebpack(args[0] ?? ''),
  };

  const fn = COMMANDS[command];
  if (!fn) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  await fn();
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
