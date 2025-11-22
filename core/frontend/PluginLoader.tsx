/// <reference types="vite/client" />

declare const __DEV_SERVER_IP__: string;
declare global {
  interface Window {
    condenserHasLoaded?: boolean;
    condenserPlugins?: string;
  }
}

export class PluginLoader {
  private loadedPlugins = new Map<string, any>();

  async loadPlugins(): Promise<void> {
    console.log('PluginLoader.loadPlugins() called');
    console.log('window.condenserHasLoaded:', window.condenserHasLoaded);
    console.log('window.condenserPlugins:', window.condenserPlugins);
    
    // Only proceed if we have plugins to load
    if (!window.condenserPlugins) {
      console.log('No plugins specified, skipping');
      return;
    }
    
    const pluginNames = window.condenserPlugins?.split(',') || [];
    console.log('Loading plugins:', pluginNames);

    for (const pluginName of pluginNames) {
      try {
        await this.loadPlugin(pluginName.trim());
      } catch (error) {
        console.error(`Failed to load plugin: ${pluginName}`, error);
      }
    }
  }

  private async loadPlugin(pluginName: string): Promise<void> {
    if (this.loadedPlugins.has(pluginName)) return;

    try {
      // Use static plugin registry
      const { getPluginFrontend } = await import('./PluginRegistry');
      const Frontend = getPluginFrontend(pluginName);
      
      if (!Frontend) {
        console.error(`Plugin not found in registry: ${pluginName}`);
        return;
      }
      
      const frontend = new Frontend();
      await frontend.connect();
      frontend.mount();
      
      this.loadedPlugins.set(pluginName, frontend);
      console.log(`Plugin loaded: ${pluginName}`);
    } catch (error) {
      console.error(`Failed to load plugin ${pluginName}:`, error);
    }
  }

  unloadAll(): void {
    this.loadedPlugins.forEach((frontend, name) => {
      try {
        frontend.unmount();
        console.log(`Plugin unloaded: ${name}`);
      } catch (error) {
        console.error(`Failed to unload plugin ${name}:`, error);
      }
    });
    this.loadedPlugins.clear();
  }
}