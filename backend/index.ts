import path from 'path';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../shared/logger.js';
import { getModeFromArg, getRuntimeConfig, getTlsOptions, Mode } from '../shared/runtime.js';
import { components } from '../frontend/index.js';
import { WsRouter } from './ws-router.js';
import { loadPlugins } from './plugin-loader.js';

export const SERVER_PORT: number = 3001;

const MIME: Record<string, string> = {
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.map':  'application/json',
};

async function startServer(mode: Mode) {
  const config = getRuntimeConfig(mode);
  const logger = createLogger('server', config.enableDebugLogs);
  const sslOptions = getTlsOptions(mode);
  const csrfToken = randomUUID();
  const clients = new Set<WebSocket>();
  const router = new WsRouter();

  router.register('get-plugins', () =>
    components.map(c => ({
      id: c.id,
      url: config.isProduction
        ? `${config.frontendOrigin}${c.vitePath.replace(/\.tsx$/, '.js')}`
        : `${config.frontendOrigin}${c.vitePath}`,
    })),
  );

  await loadPlugins(router, clients);

  const handleRequest = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/auth/token') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ token: csrfToken }));
      return;
    }

    if (config.isProduction) {
      const safePath = (req.url ?? '/').replace(/[?#].*$/, '');
      const filePath = path.join(process.cwd(), 'dist', safePath);
      const ext = path.extname(filePath);
      if (ext && existsSync(filePath)) {
        const contentType = MIME[ext] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
        createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Condenser Backend');
  };

  const server = sslOptions
    ? createHttpsServer(sslOptions, handleRequest)
    : createHttpServer(handleRequest);

  const wss = new WebSocketServer({ server });

  server.listen(config.backendPort, config.bindHost, () => {
    logger.info(`Server.started (${sslOptions ? 'WSS' : 'WS'})`, config.backendWsOrigin);
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    if (!isAllowedRequest(request, config.allowedOrigins)) {
      logger.warn('Rejected websocket connection', request.headers.origin ?? 'no-origin');
      ws.close(1008, 'Origin not allowed');
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.searchParams.get('auth') !== csrfToken) {
      logger.warn('Rejected websocket connection: invalid auth token');
      ws.close(1008, 'Unauthorized');
      return;
    }

    logger.debug('Server.connection', request.headers.origin ?? 'no-origin');
    clients.add(ws);

    ws.on('message', async (data: any) => {
      logger.debug('Server.message', data.toString());
      await router.handle(data.toString(), ws);
    });

    ws.on('close', () => {
      logger.debug('Server.close');
      clients.delete(ws);
    });
  });
}

function isAllowedRequest(request: IncomingMessage, allowedOrigins: string[]): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

startServer(getModeFromArg(process.argv.slice(2)));
