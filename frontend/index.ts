import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ComponentConfig {
  id: string;
  path: string;
  vitePath: string;
}

export const sharedPath: string = path.join(__dirname, 'shared', 'index.ts');

export const pluginsDir: string = path.join(__dirname, '..', 'plugins');

export const componentsDir: string = pluginsDir;

function discoverPlugins(): ComponentConfig[] {
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      id: d.name,
      path: path.join(pluginsDir, d.name, 'frontend.tsx'),
      vitePath: `/plugins/${d.name}/frontend.tsx`,
    }))
    .filter(c => existsSync(c.path));
}

export const components: ComponentConfig[] = discoverPlugins();
