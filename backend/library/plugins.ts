import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';
import { PluginConvention } from '../../shared/plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PluginEntry {
  id: string;
  path: string;
  vitePath: string;
}

export const pluginsDir: string = path.join(__dirname, '..', '..', 'plugins');

export function discoverPlugins(): PluginEntry[] {
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      id: d.name,
      path: path.join(pluginsDir, d.name, PluginConvention.FRONTEND_FILE),
      vitePath: `${PluginConvention.URL_PREFIX}${d.name}/${PluginConvention.FRONTEND_FILE}`,
    }))
    .filter(c => existsSync(c.path));
}
