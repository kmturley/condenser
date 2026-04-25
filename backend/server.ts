import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'https';
import { IncomingMessage } from 'http';
import { createLogger } from '../shared/logger';
import { getRuntimeConfig, getTlsOptions, Mode } from '../shared/runtime';

export const SERVER_PORT: number = 3001;

export function startServer(mode: Mode) {
  const config = getRuntimeConfig(mode);
  const logger = createLogger('server', config.enableDebugLogs);
  const sslOptions = getTlsOptions(mode);
  let wss: WebSocketServer;

  if (sslOptions) {
    const server = createServer(sslOptions, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WebSocket Server Running');
    });
    wss = new WebSocketServer({ server });
    server.listen(config.backendPort, config.bindHost, () => {
      logger.info('Server.started (WSS)', config.backendWsOrigin);
    });
  } else {
    wss = new WebSocketServer({ port: config.backendPort, host: config.bindHost });
    logger.warn('No TLS certificates found, using WS', config.backendWsOrigin);
  }

  let requestCount = 0;
  const clients = new Set<WebSocket>();

  const broadcast = (message: any) => {
    const data = JSON.stringify(message);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    if (!isAllowedRequest(request, config.allowedOrigins)) {
      logger.warn('Rejected websocket connection', request.headers.origin ?? 'no-origin');
      ws.close(1008, 'Origin not allowed');
      return;
    }

    logger.debug('Server.connection', request.headers.origin ?? 'no-origin');
    clients.add(ws);
    ws.send(JSON.stringify({ count: requestCount }));

    ws.on('message', (data: any) => {
      logger.debug('Server.message', data.toString());
      requestCount++;
      broadcast({ count: requestCount });
    });

    ws.on('close', () => {
      logger.debug('Server.close');
      clients.delete(ws);
    });
  });
}

function isAllowedRequest(request: IncomingMessage, allowedOrigins: string[]): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}
