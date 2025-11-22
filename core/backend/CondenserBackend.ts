import { ICondenserBackend } from '../shared/interfaces';
import { PluginConfig, PluginMessage } from '../shared/types';
import { MessageRouter } from './MessageRouter';
import { StateManager } from './StateManager';

export abstract class CondenserBackend implements ICondenserBackend {
  protected messageHandlers = new Map<string, (data: any) => any>();
  private messageRouter?: MessageRouter;
  protected state: StateManager;

  constructor(public config: PluginConfig) {
    this.state = new StateManager(config.namespace);
  }

  setMessageRouter(router: MessageRouter): void {
    this.messageRouter = router;
    this.messageRouter.registerPlugin(this.config.namespace, this);
  }

  registerMessage(type: string, handler: (data: any) => any): void {
    this.messageHandlers.set(type, handler);
  }

  sendMessage(type: string, payload: any): void {
    if (!this.messageRouter) return;
    
    const message: PluginMessage = {
      namespace: this.config.namespace,
      type,
      payload
    };
    this.messageRouter.broadcast(message);
  }

  handleMessage(message: PluginMessage): any {
    const handler = this.messageHandlers.get(message.type);
    return handler ? handler(message.payload) : null;
  }
}