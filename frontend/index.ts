import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ComponentConfig {
  id: string;
  path: string;
}

export const sharedPath: string = path.join(__dirname, 'shared', 'index.ts');

export const componentsDir: string = path.join(__dirname, 'components');

export const components: ComponentConfig[] = [
  { id: 'condenser-tab', path: path.join(__dirname, 'components', 'condenser-tab.tsx') },
];
