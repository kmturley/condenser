export interface PluginMessage {
  namespace: string;
  type: string;
  payload: any;
  id?: string;
}

export interface PageMatcher {
  url?: RegExp;
  title?: string;
  selector?: string;
}

export interface PluginConfig {
  name: string;
  namespace: string;
  targetPages: PageMatcher[];
  targetUrls?: string[];
  mountSelector: string;
  serverUrl?: string;
  duplicateCheck?: string;
}

export interface ServiceConfig {
  debugUrls: string[];
  serverPort: number;
  vitePort: number;
  pluginsPath: string;
  certificates: {
    enabled: boolean;
    path: string;
    autoDetect: boolean;
  };
  ssl: {
    rejectUnauthorized: boolean;
  };
}