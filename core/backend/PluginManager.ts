import { IPluginManager } from '../shared/interfaces';
import { PluginConfig, PageMatcher } from '../shared/types';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

export class PluginManager implements IPluginManager {
  private plugins = new Map<string, PluginConfig>();
  private loadedBackends = new Map<string, any>();

  constructor(private pluginsPath: string) {}

  async discoverPlugins(): Promise<PluginConfig[]> {
    if (!existsSync(this.pluginsPath)) return [];

    const pluginDirs = readdirSync(this.pluginsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const dir of pluginDirs) {
      const configPath = join(this.pluginsPath, dir, 'Config.ts');
      if (existsSync(configPath)) {
        try {
          const { config } = await import(`file://${process.cwd()}/${configPath}`);
          this.plugins.set(config.namespace, config);
        } catch (error) {
          console.error(`Failed to load plugin config: ${dir}`, error);
        }
      }
    }

    return Array.from(this.plugins.values());
  }

  async loadPlugin(config: PluginConfig): Promise<void> {
    if (this.loadedBackends.has(config.namespace)) return;

    try {
      const backendPath = join(this.pluginsPath, config.name, 'Backend.ts');
      if (existsSync(backendPath)) {
        const { Backend } = await import(`file://${process.cwd()}/${backendPath}`);
        const backend = new Backend();
        this.loadedBackends.set(config.namespace, backend);
      }
    } catch (error) {
      console.error(`Failed to load plugin backend: ${config.name}`, error);
    }
  }

  getMatchingPlugins(url: string, title: string): PluginConfig[] {
    return Array.from(this.plugins.values()).filter(config => 
      this.matchesPage(config.targetPages, url, title)
    );
  }

  private matchesPage(matchers: PageMatcher[], url: string, title: string): boolean {
    // Exclude devtools and internal pages
    if (url.startsWith('devtools://') || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return false;
    }
    
    return matchers.some(matcher => {
      if (matcher.url && !matcher.url.test(url)) return false;
      if (matcher.title && matcher.title !== title) return false;
      return true;
    });
  }

  getLoadedBackend(namespace: string): any {
    return this.loadedBackends.get(namespace);
  }
}