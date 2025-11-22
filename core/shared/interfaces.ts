import { PluginMessage, PluginConfig } from './types';

export interface ICondenserBackend {
  config: PluginConfig;
  registerMessage(type: string, handler: (data: any) => any): void;
  sendMessage(type: string, payload: any): void;
}

export interface ICondenserFrontend {
  config: PluginConfig;
  connect(): Promise<void>;
  sendMessage(type: string, payload: any): void;
  onMessage(type: string, handler: (data: any) => void): void;
  mount(): void;
  unmount(): void;
}

export interface IPluginManager {
  discoverPlugins(): Promise<PluginConfig[]>;
  loadPlugin(config: PluginConfig): Promise<void>;
  getMatchingPlugins(url: string, title: string): PluginConfig[];
}