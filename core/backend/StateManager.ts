import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class StateManager {
  private stateDir: string;
  private memoryStore = new Map<string, any>();

  constructor(pluginNamespace: string, persistToDisk = true) {
    this.stateDir = join(process.cwd(), '.condenser', 'state', pluginNamespace);
    if (persistToDisk && !existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  // Memory-based state
  set(key: string, value: any): void {
    this.memoryStore.set(key, value);
  }

  get(key: string): any {
    return this.memoryStore.get(key);
  }

  has(key: string): boolean {
    return this.memoryStore.has(key);
  }

  delete(key: string): boolean {
    return this.memoryStore.delete(key);
  }

  clear(): void {
    this.memoryStore.clear();
  }

  // File-based persistence
  save(key: string, value: any): void {
    try {
      const filePath = join(this.stateDir, `${key}.json`);
      writeFileSync(filePath, JSON.stringify(value, null, 2));
      this.set(key, value); // Also store in memory
    } catch (error) {
      console.error(`Failed to save state for key ${key}:`, error);
    }
  }

  load(key: string): any {
    try {
      const filePath = join(this.stateDir, `${key}.json`);
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        this.set(key, data); // Store in memory
        return data;
      }
    } catch (error) {
      console.error(`Failed to load state for key ${key}:`, error);
    }
    return undefined;
  }

  // Get all keys
  keys(): string[] {
    return Array.from(this.memoryStore.keys());
  }

  // Export all state
  export(): Record<string, any> {
    const state: Record<string, any> = {};
    for (const [key, value] of this.memoryStore) {
      state[key] = value;
    }
    return state;
  }

  // Import state
  import(state: Record<string, any>): void {
    for (const [key, value] of Object.entries(state)) {
      this.set(key, value);
    }
  }
}