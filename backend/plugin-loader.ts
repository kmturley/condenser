import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, readdirSync } from 'fs';
import WebSocket from 'ws';
import { WsRouter, broadcastEvent } from './ws-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, '..', 'plugins');

export interface BackendAPI {
  emit(event: string, data?: Record<string, unknown>): void;
}

interface PluginBackend {
  onLoad?(api: BackendAPI): void;
  onUnload?(): void;
  onMessage?(action: string, data: unknown, respond: (result: unknown) => void): void;
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

  if (mod.onMessage) {
    router.register(id, (params: any) =>
      new Promise((resolve) => {
        mod.onMessage!(params?.action ?? '', params?.data, resolve);
      }),
    );
  }
}
