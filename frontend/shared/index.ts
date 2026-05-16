/// <reference lib="dom" />

// Evaluated once by backend before any components are loaded.
// Populates window.__condenser.shared with utilities available to all components.

const condenser: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });

// Connects to the backend WebSocket, requests the plugin list, and handles
// hot-reload events for the lifetime of the page.
condenser.shared.initPluginLoader = function initPluginLoader(condenser: any): void {
  const wsUrl: string = condenser.core.url;
  if (!wsUrl) { console.warn('[condenser] initPluginLoader: no WS URL set'); return; }

  const httpUrl = wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

  const connect = async () => {
    let token: string;
    try {
      const res = await fetch(`${httpUrl}/auth/token`);
      const json = await res.json();
      token = json.token;
      condenser.core.csrfToken = token;
    } catch (e: any) {
      console.error('[condenser] Failed to fetch auth token:', e.message);
      setTimeout(connect, 3000);
      return;
    }

    const ws = new WebSocket(`${wsUrl}?auth=${token}`);
    condenser.core.ws = ws;

    ws.onerror = () => {
      const certUrl = wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      console.info('[condenser] If certificate issue, open ' + certUrl + ' in browser once');
    };

    ws.onopen = async () => {
      const plugins = await condenser.shared.callPlugin('get-plugins');
      if (Array.isArray(plugins)) {
        for (const { id, url } of plugins) {
          await condenser.shared.loadPlugin(id, url, condenser);
        }
      }
    };

    ws.onmessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 1) {
        const pending = condenser.core.pendingCalls?.get(msg.id);
        if (pending) {
          condenser.core.pendingCalls.delete(msg.id);
          msg.error ? pending.reject(new Error(msg.error)) : pending.resolve(msg.result);
        }
      }
      if (msg.type === 3 && msg.event === 'plugin-updated') {
        await condenser.shared.loadPlugin(msg.id, msg.url, condenser);
      }
    };

    ws.onclose = () => {
      condenser.core.ws = null;
      setTimeout(connect, 3000);
    };
  };

  connect();
};

condenser.shared.callPlugin = function callPlugin(route: string, params?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws: WebSocket = condenser.core.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('[condenser] WebSocket not connected'));
      return;
    }
    condenser.core.pendingCalls ??= new Map();
    condenser.core.callSeq ??= 0;
    const id = ++condenser.core.callSeq;
    condenser.core.pendingCalls.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 0, route, id, params }));
  });
};

// Dynamically imports a plugin module at the given URL and registers it.
condenser.shared.loadPlugin = async function loadPlugin(
  id: string,
  url: string,
  condenser: any,
): Promise<void> {
  try {
    const mod = await import(/* @vite-ignore */ url);
    const ns: any = (condenser.components[id] ||= {});
    const api = {
      send: (action: string, data?: unknown) => condenser.shared.callPlugin(id, { action, data }),
    };
    ns.component = typeof mod.default === 'function' ? mod.default(api) : mod.default;
    condenser.shared.renderComponent(id, condenser);
    ns.forceUpdate?.();
    console.info('[condenser] Loaded plugin', id);
  } catch (e: any) {
    console.error('[condenser] Failed to load plugin', id, e.message);
  }
};

condenser.shared.useWebSocket = function useWebSocket(React: any, url: string) {
  const [count, setCount] = React.useState(0);
  const wsRef = React.useRef(null as WebSocket | null);

  React.useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const token = (window as any).__condenser?.core?.csrfToken;
      const fullUrl = token ? `${url}?auth=${token}` : url;
      const socket = new WebSocket(fullUrl);
      wsRef.current = socket;

      socket.onerror = () => {
        const certUrl = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        console.info('[condenser] If certificate issue, open ' + certUrl + ' in browser once');
      };
      socket.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        setCount(data.count);
      };
      socket.onclose = () => {
        wsRef.current = null;
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [url]);

  const send = (data: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      console.warn('[condenser] Cannot send: WebSocket not open');
    }
  };

  return { count, send };
};

// ─── Steam / React utilities ──────────────────────────────────────────────────

condenser.shared.wrapReturnValue = function wrapReturnValue(
  object: any,
  property: string,
  handler: (args: any[], returnValue: any) => any,
): void {
  const original = object[property];
  object[property] = function(this: any, ...args: any[]) {
    return handler.call(this, args, original.call(this, ...args));
  };
  object[property].toString = () => original.toString();
};

condenser.shared.buildWebpackRegistry = function buildWebpackRegistry(): Map<string, any> {
  const chunkArray = (window as any).webpackChunksteamui as any[][];
  if (!chunkArray) throw new Error('webpackChunksteamui not found');
  let webpackRequire: any;
  chunkArray.push([[Symbol('@inject/probe')], {}, (r: any) => { webpackRequire = r; }]);
  if (!webpackRequire) throw new Error('Failed to capture webpack require');
  const registry = new Map<string, any>();
  for (const id of Object.keys(webpackRequire.m)) {
    try {
      const mod = webpackRequire(id);
      if (mod) registry.set(id, mod);
    } catch (_) {}
  }
  return registry;
};

condenser.shared.findWebpackModule = function findWebpackModule(
  registry: Map<string, any>,
  filter: (m: any) => boolean,
): any {
  for (const m of registry.values()) {
    if (m.default && filter(m.default)) return m.default;
    if (filter(m)) return m;
  }
  return null;
};

condenser.shared.findWebpackModuleByExport = function findWebpackModuleByExport(
  registry: Map<string, any>,
  filter: (exported: any) => boolean,
): any {
  for (const m of registry.values()) {
    for (const candidate of [m.default, m]) {
      if (!candidate || typeof candidate !== 'object') continue;
      for (const key of Object.keys(candidate)) {
        try { if (filter(candidate[key])) return candidate; } catch (_) {}
      }
    }
  }
  return null;
};

function findInTree(node: any, filter: (n: any) => boolean, walkKeys: string[]): any {
  if (!node || typeof node !== 'object') return null;
  if (filter(node)) return node;
  if (Array.isArray(node)) return node.map((x: any) => findInTree(x, filter, walkKeys)).find(Boolean) ?? null;
  return walkKeys.map(k => findInTree(node[k], filter, walkKeys)).find(Boolean) ?? null;
}

condenser.shared.findInFiberTree = function findInFiberTree(node: any, filter: (n: any) => boolean): any {
  return findInTree(node, filter, ['child', 'sibling']);
};

condenser.shared.findInElementTree = function findInElementTree(node: any, filter: (n: any) => boolean): any {
  return findInTree(node, filter, ['props', 'children', 'child', 'sibling']);
};

condenser.shared.getReactFiberRoot = function getReactFiberRoot(element: any): any {
  const key = Object.keys(element).find((k: string) => k.startsWith('__reactContainer$'));
  return key ? element[key] : element['_reactRootContainer']?._internalRoot?.current;
};

// Finds and caches React, ReactDOM and known Steam view renderers in condenser.core.
// Returns an error string if React or ReactDOM cannot be found, null otherwise.
condenser.shared.discoverSteamContext = function discoverSteamContext(condenser: any): string | null {
  const { buildWebpackRegistry, findWebpackModule, findWebpackModuleByExport } = condenser.shared;

  const registry: Map<string, any> = condenser.core.webpackRegistry
    ?? (condenser.core.webpackRegistry = buildWebpackRegistry());

  condenser.core.React = condenser.core.React
    ?? findWebpackModule(registry, (m: any) => m.Component && m.PureComponent && m.useLayoutEffect);
  condenser.core.ReactDOM = condenser.core.ReactDOM
    ?? findWebpackModule(registry, (m: any) => typeof m.createRoot === 'function');

  if (!condenser.core.React) return 'React not found in webpack registry';
  if (!condenser.core.ReactDOM) return 'ReactDOM not found in webpack registry';

  if (!condenser.core.quickAccessMenuRenderer) {
    const isQuickAccessMenuRenderer = (v: any) =>
      (v?.type?.toString?.() ?? '').includes('QuickAccessMenuBrowserView');
    const qamModule = findWebpackModuleByExport(registry, isQuickAccessMenuRenderer);
    if (qamModule) {
      condenser.core.quickAccessMenuRenderer =
        Object.values(qamModule as object).find(isQuickAccessMenuRenderer) ?? null;
    }
  }

  return null;
};

// Dispatches a registered component into its target Steam view.
condenser.shared.renderComponent = function renderComponent(id: string, condenser: any): void {
  const def = condenser.components[id]?.component;
  if (!def?.target) return;
  if (def.target === 'quick-access-menu') condenser.shared.activateQuickAccessMenu(condenser);
};

// Patches the Quick Access Menu renderer once so appendTab can inject tabs on
// every subsequent render. Idempotent — subsequent calls are no-ops.
condenser.shared.activateQuickAccessMenu = function activateQuickAccessMenu(condenser: any): void {
  if (condenser.core.patched) return;
  condenser.core.patched = true;

  const renderer = condenser.core.quickAccessMenuRenderer;
  if (!renderer) return;

  const React = condenser.core.React;
  const { wrapReturnValue, findInElementTree, findInFiberTree, getReactFiberRoot, appendTab } = condenser.shared;
  const patchedTypeCache: Map<any, any> =
    condenser.core.patchedTypeCache ?? (condenser.core.patchedTypeCache = new Map());

  wrapReturnValue(renderer, 'type', (_outerArgs: any[], outerReturnValue: any) => {
    const innerElement = findInElementTree(outerReturnValue, (x: any) => x?.props?.onFocusNavDeactivated !== undefined);
    if (innerElement) {
      const cached = patchedTypeCache.get(innerElement.type);
      if (cached) {
        innerElement.type = cached;
      } else {
        const originalType = innerElement.type;
        if (typeof originalType === 'function') {
          wrapReturnValue(innerElement, 'type', appendTab('quick-access-menu', React, condenser));
        }
        patchedTypeCache.set(originalType, innerElement.type);
      }
    }
    return outerReturnValue;
  });

  const rootElement = document.getElementById('root');
  const fiberRoot = rootElement ? getReactFiberRoot(rootElement) : null;
  const qamFiberNode = fiberRoot
    ? findInFiberTree(fiberRoot, (n: any) => n.elementType === renderer)
    : null;
  if (qamFiberNode) {
    qamFiberNode.type = qamFiberNode.elementType.type;
    if (qamFiberNode.alternate) qamFiberNode.alternate.type = qamFiberNode.type;
  }
};

// Returns a wrapReturnValue-compatible handler that appends a tab for every
// registered component whose target matches the given Steam view name.
condenser.shared.appendTab = function appendTab(
  target: string,
  React: any,
  condenser: any,
): (args: any[], returnValue: any) => any {
  let titleClassName = '';

  function InjectedTabPanel(props: any) {
    const R = (window as any).__condenser.core.React;
    const [, setTick] = R.useState(0);
    const ns = (condenser.components[props.id] ||= {});
    R.useLayoutEffect(() => {
      ns.forceUpdate = () => setTick((t: number) => t + 1);
      return () => { ns.forceUpdate = undefined; };
    }, []);
    const Panel = ns.component?.panel;
    return Panel
      ? R.createElement(Panel, { websocketUrl: condenser.core.url })
      : null;
  }

  return function(_args: any[], returnValue: any): any {
    const tabsNode = condenser.shared.findInElementTree(returnValue, (x: any) => Array.isArray(x?.props?.tabs));
    if (!tabsNode) return returnValue;

    for (const [id, ns] of Object.entries(condenser.components as Record<string, any>)) {
      const def = ns?.component;
      if (!def || def.target !== target) continue;
      if (tabsNode.props.tabs.some((t: any) => t.key === def.key)) continue;

      if (!titleClassName) {
        const nativeTitleType = tabsNode.props.tabs[0]?.title?.type;
        const sample = typeof nativeTitleType === 'function' ? nativeTitleType({ locId: '' }) : null;
        titleClassName = sample?.props?.className ?? '';
      }

      tabsNode.props.tabs.push({
        key: def.key,
        tab: def.tab(React),
        initialVisibility: false,
        panel: React.createElement(InjectedTabPanel, { id }),
        title: titleClassName
          ? React.createElement('div', { className: titleClassName }, def.title ?? def.key)
          : def.tab(React),
      });
    }

    return returnValue;
  };
};
