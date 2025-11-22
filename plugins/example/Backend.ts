import { CondenserBackend } from '../../core/backend/CondenserBackend';
import { config } from './Config';

export class Backend extends CondenserBackend {
  constructor() {
    super(config);
    this.registerMessage('getData', this.handleGetData.bind(this));
    this.registerMessage('increment', this.handleIncrement.bind(this));
    this.registerMessage('reset', this.handleReset.bind(this));
    this.registerMessage('click', this.handleClick.bind(this));
  }
  
  private count = 0;
  
  handleGetData() {
    return { 
      message: 'Hello from example plugin!', 
      count: this.count,
      timestamp: new Date().toISOString(),
      pluginInfo: {
        name: this.config.name,
        namespace: this.config.namespace
      }
    };
  }
  
  handleIncrement(data: { amount?: number } = {}) {
    const amount = data.amount || 1;
    this.count += amount;
    this.sendMessage('countUpdated', { 
      count: this.count, 
      increment: amount,
      timestamp: new Date().toISOString()
    });
    return { count: this.count, increment: amount };
  }
  
  handleReset() {
    this.count = 0;
    this.sendMessage('countUpdated', { 
      count: this.count, 
      reset: true,
      timestamp: new Date().toISOString()
    });
    return { count: this.count };
  }
  
  handleClick() {
    this.count++;
    this.sendMessage('count', { count: this.count });
    return { count: this.count };
  }
}