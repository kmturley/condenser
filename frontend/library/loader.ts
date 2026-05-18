/// <reference lib="dom" />

import { renderComponent } from './qam.js';
import { MessageType } from '../../shared/protocol.js';

export function callPlugin(route: string, params?: unknown): Promise<any> {
  const condenser = (window as any).__condenser;
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
    ws.send(JSON.stringify({ type: MessageType.CALL, route, id, params }));
  });
}

export async function loadPlugin(id: string, url: string): Promise<void> {
  const condenser = (window as any).__condenser;
  try {
    const mod = await import(/* @vite-ignore */ url);
    const ns: any = (condenser.components[id] ||= {});
    ns.component = {
      target: mod.target,
      key: mod.key ?? id,
      title: mod.title,
      tab: mod.Tab,
      panel: mod.Panel,
    };
    renderComponent(id);
    ns.forceUpdate?.();
    console.info('[condenser] Loaded plugin', id);
  } catch (e: any) {
    console.error('[condenser] Failed to load plugin', id, e.message);
  }
}

export function initPluginLoader(): void {
  const condenser = (window as any).__condenser;
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
      const plugins = await callPlugin('get-plugins');
      if (Array.isArray(plugins)) {
        for (const { id, url } of plugins) {
          await loadPlugin(id, url);
        }
      }
    };

    ws.onmessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === MessageType.REPLY) {
        const pending = condenser.core.pendingCalls?.get(msg.id);
        if (pending) {
          condenser.core.pendingCalls.delete(msg.id);
          msg.error ? pending.reject(new Error(msg.error)) : pending.resolve(msg.result);
        }
      }
      if (msg.type === MessageType.EVENT && msg.event === 'plugin-updated') {
        await loadPlugin(msg.id, msg.url);
      }
    };

    ws.onclose = () => {
      condenser.core.ws = null;
      setTimeout(connect, 3000);
    };
  };

  connect();
}
