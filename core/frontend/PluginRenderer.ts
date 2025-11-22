import React from 'react';
import { createRoot, Root } from 'react-dom/client';

export class PluginRenderer {
  private root?: Root;
  private container?: HTMLElement;

  constructor(private mountSelector: string) {}

  mount(component: React.ReactElement): void {
    if (this.root) {
      this.unmount();
    }

    const container = this.findOrCreateContainer();
    if (container) {
      this.container = container;
      this.root = createRoot(this.container);
      this.root.render(component);
    }
  }

  unmount(): void {
    if (this.root) {
      this.root.unmount();
      this.root = undefined;
    }
    if (this.container && this.container.id.startsWith('condenser-')) {
      this.container.remove();
      this.container = undefined;
    }
  }

  private findOrCreateContainer(): HTMLElement | null {
    // Try to find existing mount point
    let container = document.querySelector(this.mountSelector) as HTMLElement;
    
    if (!container) {
      // Create new container if mount selector doesn't exist
      container = document.createElement('div');
      container.id = `condenser-${Date.now()}`;
      document.body.appendChild(container);
    }
    
    return container;
  }
}