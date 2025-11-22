import WebSocket from 'ws';
import { PluginMessage } from '../shared/types';
import { CondenserBackend } from './CondenserBackend';

export class MessageRouter {
  private clients = new Set<WebSocket>();
  private plugins = new Map<string, CondenserBackend>();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    
    ws.on('message', (data: any) => {
      try {
        const message: PluginMessage = JSON.parse(data.toString());
        this.routeMessage(message, ws);
      } catch (error) {
        console.error('Invalid message format:', error);
      }
    });
    
    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  registerPlugin(namespace: string, plugin: CondenserBackend): void {
    this.plugins.set(namespace, plugin);
  }

  private routeMessage(message: PluginMessage, sender: WebSocket): void {
    // Validate namespace
    if (!this.isValidNamespace(message.namespace)) {
      console.error('Invalid namespace:', message.namespace);
      return;
    }



    const plugin = this.plugins.get(message.namespace);
    if (plugin) {
      const response = plugin.handleMessage(message);
      if (response && message.id) {
        const responseMessage: PluginMessage = {
          namespace: message.namespace,
          type: `${message.type}_response`,
          payload: response,
          id: message.id
        };
        sender.send(JSON.stringify(responseMessage));
      }
    }
  }



  broadcast(message: PluginMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private isValidNamespace(namespace: string): boolean {
    // Core system reserves 'core.*' namespace
    if (namespace.startsWith('core.')) return false;
    // Must be registered plugin
    return this.plugins.has(namespace);
  }
}