declare module 'condenser:plugin' {
  export interface PluginAPI {
    send(action: string, data?: unknown): Promise<any>;
  }

  export interface PluginConfig {
    target: string;
    key: string;
    title?: string;
    tab?: (...args: any[]) => any;
    panel?: (...args: any[]) => any;
  }

  export function definePlugin(
    factory: (api: PluginAPI) => PluginConfig,
  ): (api: PluginAPI) => PluginConfig;
}
