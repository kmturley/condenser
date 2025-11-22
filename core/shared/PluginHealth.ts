export interface PluginHealthStatus {
  namespace: string;
  status: 'healthy' | 'warning' | 'error';
  lastSeen: Date;
  messageCount: number;
  errors: string[];
  warnings: string[];
}

export class PluginHealthMonitor {
  private healthStatus = new Map<string, PluginHealthStatus>();
  private checkInterval: NodeJS.Timeout;

  constructor(checkIntervalMs = 30000) {
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, checkIntervalMs);
  }

  registerPlugin(namespace: string): void {
    this.healthStatus.set(namespace, {
      namespace,
      status: 'healthy',
      lastSeen: new Date(),
      messageCount: 0,
      errors: [],
      warnings: []
    });
  }

  recordMessage(namespace: string): void {
    const status = this.healthStatus.get(namespace);
    if (status) {
      status.lastSeen = new Date();
      status.messageCount++;
    }
  }

  recordError(namespace: string, error: string): void {
    const status = this.healthStatus.get(namespace);
    if (status) {
      status.errors.push(error);
      status.status = 'error';
      // Keep only last 10 errors
      if (status.errors.length > 10) {
        status.errors = status.errors.slice(-10);
      }
    }
  }

  recordWarning(namespace: string, warning: string): void {
    const status = this.healthStatus.get(namespace);
    if (status) {
      status.warnings.push(warning);
      if (status.status === 'healthy') {
        status.status = 'warning';
      }
      // Keep only last 10 warnings
      if (status.warnings.length > 10) {
        status.warnings = status.warnings.slice(-10);
      }
    }
  }

  getHealth(namespace?: string): PluginHealthStatus | PluginHealthStatus[] {
    if (namespace) {
      return this.healthStatus.get(namespace) || null;
    }
    return Array.from(this.healthStatus.values());
  }

  private performHealthCheck(): void {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [namespace, status] of this.healthStatus) {
      const timeSinceLastSeen = now.getTime() - status.lastSeen.getTime();
      
      if (timeSinceLastSeen > staleThreshold) {
        this.recordWarning(namespace, 'Plugin appears to be inactive');
      } else if (status.status === 'warning' && status.warnings.length === 1) {
        // Clear inactive warning if plugin is active again
        status.warnings = [];
        status.status = 'healthy';
      }
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}