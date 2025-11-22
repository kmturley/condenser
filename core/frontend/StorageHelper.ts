export class StorageHelper {
  private prefix: string;

  constructor(pluginNamespace: string) {
    this.prefix = `condenser_${pluginNamespace}_`;
  }

  // localStorage helpers
  setLocal(key: string, value: any): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to set localStorage for ${key}:`, error);
    }
  }

  getLocal(key: string): any {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : undefined;
    } catch (error) {
      console.error(`Failed to get localStorage for ${key}:`, error);
      return undefined;
    }
  }

  removeLocal(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clearLocal(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  // sessionStorage helpers
  setSession(key: string, value: any): void {
    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to set sessionStorage for ${key}:`, error);
    }
  }

  getSession(key: string): any {
    try {
      const item = sessionStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : undefined;
    } catch (error) {
      console.error(`Failed to get sessionStorage for ${key}:`, error);
      return undefined;
    }
  }

  removeSession(key: string): void {
    sessionStorage.removeItem(this.prefix + key);
  }

  clearSession(): void {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        sessionStorage.removeItem(key);
      }
    });
  }

  // Get all keys for this plugin
  getLocalKeys(): string[] {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.replace(this.prefix, ''));
  }

  getSessionKeys(): string[] {
    return Object.keys(sessionStorage)
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.replace(this.prefix, ''));
  }
}