import { ServiceConfig } from '../shared/types';
import { PluginManager } from './PluginManager';
import { BrowserConnector } from './BrowserConnector';
import { MessageRouter } from './MessageRouter';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'https';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export class CondenserService {
  private config: ServiceConfig;
  private pluginManager: PluginManager;
  private browserConnector: BrowserConnector;
  private messageRouter: MessageRouter;
  private wss?: WebSocketServer;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.pluginManager = new PluginManager(config.pluginsPath);
    this.browserConnector = new BrowserConnector(config.debugUrls);
    this.messageRouter = new MessageRouter();
  }

  async start(): Promise<void> {
    await this.startWebSocketServer();
    
    // Start browser discovery immediately (like old prototype)
    const browserDiscovery = this.browserConnector.startDiscovery(this.pluginManager);
    
    // Load plugins in parallel
    const pluginDiscovery = this.loadPlugins();
    
    // Wait for both to complete
    await Promise.all([browserDiscovery, pluginDiscovery]);
  }
  
  private async loadPlugins(): Promise<void> {
    const plugins = await this.pluginManager.discoverPlugins();
    
    // Load and register plugin backends
    for (const config of plugins) {
      await this.pluginManager.loadPlugin(config);
      const backend = this.pluginManager.getLoadedBackend(config.namespace);
      if (backend) {
        backend.setMessageRouter(this.messageRouter);
      }
    }
  }

  private async startWebSocketServer(): Promise<void> {
    const hasSSL = this.config.certificates.autoDetect && 
                   existsSync(join(this.config.certificates.path, 'cert.pem'));
    
    if (hasSSL) {
      const sslOptions = {
        key: readFileSync(join(this.config.certificates.path, 'key.pem')),
        cert: readFileSync(join(this.config.certificates.path, 'cert.pem'))
      };
      const server = createServer(sslOptions);
      this.wss = new WebSocketServer({ server });
      server.listen(this.config.serverPort, '0.0.0.0');
    } else {
      this.wss = new WebSocketServer({ 
        port: this.config.serverPort, 
        host: '0.0.0.0' 
      });
    }

    this.wss.on('connection', (ws: WebSocket) => {
      this.messageRouter.addClient(ws);
    });
  }

  getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }
}