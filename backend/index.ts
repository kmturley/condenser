import { CondenserService } from '../core/backend/CondenserService';
import { ServiceConfig } from '../core/shared/types';

const config: ServiceConfig = {
  debugUrls: [
    'http://localhost:8080',    // Steam app
    'http://localhost:9222',    // Chrome
    'http://steamdeck:8081'     // Steam Deck
  ],
  serverPort: 3001,
  vitePort: 3000,
  pluginsPath: './plugins',
  certificates: {
    enabled: true,
    path: './certs',
    autoDetect: true
  },
  ssl: {
    rejectUnauthorized: false
  }
};

const service = new CondenserService(config);
service.start().catch(console.error);
