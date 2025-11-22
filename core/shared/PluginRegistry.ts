export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  keywords: string[];
  dependencies?: Record<string, string>;
  steamApiPermissions?: string[];
}

export interface PluginPackage {
  metadata: PluginMetadata;
  config: any;
  backendPath: string;
  frontendPath: string;
  installed: boolean;
  enabled: boolean;
}

export class PluginRegistry {
  private plugins = new Map<string, PluginPackage>();
  private remoteRegistries: string[] = [];

  constructor() {
    // Future: Add default plugin registry URLs
    this.remoteRegistries = [
      // 'https://registry.condenser.dev/plugins'
    ];
  }

  // Local plugin management
  registerPlugin(plugin: PluginPackage): void {
    this.plugins.set(plugin.metadata.name, plugin);
  }

  getPlugin(name: string): PluginPackage | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): PluginPackage[] {
    return Array.from(this.plugins.values());
  }

  getEnabledPlugins(): PluginPackage[] {
    return this.getAllPlugins().filter(p => p.enabled);
  }

  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin && plugin.installed) {
      plugin.enabled = true;
      return true;
    }
    return false;
  }

  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      return true;
    }
    return false;
  }

  // Future: Remote plugin management
  async searchPlugins(query: string): Promise<PluginMetadata[]> {
    // Future implementation for plugin marketplace
    console.log('Plugin search not yet implemented:', query);
    return [];
  }

  async installPlugin(name: string, version?: string): Promise<boolean> {
    // Future implementation for plugin installation
    console.log('Plugin installation not yet implemented:', name, version);
    return false;
  }

  async uninstallPlugin(name: string): Promise<boolean> {
    // Future implementation for plugin uninstallation
    console.log('Plugin uninstallation not yet implemented:', name);
    return false;
  }

  async updatePlugin(name: string): Promise<boolean> {
    // Future implementation for plugin updates
    console.log('Plugin update not yet implemented:', name);
    return false;
  }

  // Steam API integration points
  async requestSteamApiPermission(pluginName: string, permission: string): Promise<boolean> {
    // Future implementation for Steam API permissions
    console.log('Steam API permission request not yet implemented:', pluginName, permission);
    return false;
  }

  // Cross-plugin communication (future feature)
  async sendCrossPluginMessage(fromPlugin: string, toPlugin: string, message: any): Promise<any> {
    // Future implementation for secure cross-plugin communication
    console.log('Cross-plugin communication not yet implemented:', fromPlugin, toPlugin, message);
    return null;
  }

  // Plugin validation and security
  validatePlugin(plugin: PluginPackage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plugin.metadata.name) {
      errors.push('Plugin name is required');
    }

    if (!plugin.metadata.version) {
      errors.push('Plugin version is required');
    }

    if (!plugin.config) {
      errors.push('Plugin config is required');
    }

    // Future: Add more validation rules
    // - Check for malicious code patterns
    // - Validate Steam API permissions
    // - Check plugin dependencies

    return {
      valid: errors.length === 0,
      errors
    };
  }
}