import { ICondenserFrontend } from '../shared/interfaces';
import { PluginConfig, PluginMessage } from '../shared/types';
import { WebSocketClient } from './WebSocketClient';
import { PluginRenderer } from './PluginRenderer';
import { StorageHelper } from './StorageHelper';

export abstract class CondenserFrontend implements ICondenserFrontend {
  protected wsClient: WebSocketClient;
  protected renderer: PluginRenderer;
  protected storage: StorageHelper;
  private messageHandlers = new Map<string, (data: any) => void>();

  constructor(public config: PluginConfig) {
    this.wsClient = new WebSocketClient(this.getServerUrl());
    this.renderer = new PluginRenderer(config.mountSelector);
    this.storage = new StorageHelper(config.namespace);
    this.setupMessageHandling();
  }

  async connect(): Promise<void> {
    await this.wsClient.connect();
  }

  sendMessage(type: string, payload: any): void {
    const message: PluginMessage = {
      namespace: this.config.namespace,
      type,
      payload
    };
    this.wsClient.send(message);
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  mount(): void {
    const component = this.render();
    if (component) {
      this.renderer.mount(component);
    }
  }

  unmount(): void {
    this.renderer.unmount();
  }

  protected abstract render(): React.ReactElement | null;

  private setupMessageHandling(): void {
    this.wsClient.onMessage((message: PluginMessage) => {
      if (message.namespace === this.config.namespace) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.payload);
        }
      }
    });
  }

  private getServerUrl(): string {
    if (this.config.serverUrl && this.config.serverUrl !== 'auto') {
      return this.config.serverUrl;
    }
    
    // Auto-detect server URL like original prototype
    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'wss:' : 'ws:';
    // Use development server IP passed from Vite config
    const devServerHost = typeof (window as any).__DEV_SERVER_IP__ !== 'undefined' ? (window as any).__DEV_SERVER_IP__ : 'localhost';
    // Use server port injected by backend
    const serverPort = typeof (window as any).condenserServerPort !== 'undefined' ? (window as any).condenserServerPort : 3001;
    return `${protocol}//${devServerHost}:${serverPort}`;
  }
}