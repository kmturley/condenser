import path from 'path';
import { pathToFileURL } from 'url';
import { existsSync, readdirSync } from 'fs';
import WebSocket from 'ws';
import { WsRouter, broadcastEvent } from './ws-router.js';
import { pluginsDir } from './plugins.js';

export interface BackendAPI {
  emit(event: string, data?: Record<string, unknown>): void;
}

const RESERVED = new Set(['onLoad', 'onUnload']);

interface PluginBackend {
  onLoad?(api: BackendAPI): void;
  onUnload?(): void;
  [action: string]: unknown;
}

export async function loadPlugins(router: WsRouter, clients: Set<WebSocket>): Promise<void> {
  if (!existsSync(pluginsDir)) return;
  for (const d of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const backendPath = path.join(pluginsDir, d.name, 'backend.ts');
    if (!existsSync(backendPath)) continue;
    await loadPlugin(d.name, backendPath, router, clients);
  }
}

async function loadPlugin(
  id: string,
  filePath: string,
  router: WsRouter,
  clients: Set<WebSocket>,
): Promise<void> {
  const mod = await import(pathToFileURL(filePath).href) as PluginBackend;

  const api: BackendAPI = {
    emit(event, data = {}) {
      broadcastEvent(clients, `${id}/${event}`, data);
    },
  };

  mod.onLoad?.(api);

  const actions = Object.entries(mod).filter(
    ([name, fn]) => typeof fn === 'function' && !RESERVED.has(name),
  );

  if (actions.length > 0) {
    router.register(id, async (params: any) => {
      const action: string = params?.action ?? '';
      const fn = mod[action];
      if (typeof fn !== 'function') throw new Error(`Unknown action: ${action}`);
      return (fn as (...args: unknown[]) => unknown)(params?.data);
    });
  }
}
