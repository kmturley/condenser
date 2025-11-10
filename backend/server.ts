import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'https';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const SERVER_PORT: number = 3001;
const hasSSL = existsSync(join(process.cwd(), 'certs', 'cert.pem'));
export const SERVER_URL: string = `${hasSSL ? 'wss' : 'ws'}://localhost:${SERVER_PORT}`;

function createSSLOptions() {
  try {
    return {
      key: readFileSync(join(process.cwd(), 'certs', 'key.pem')),
      cert: readFileSync(join(process.cwd(), 'certs', 'cert.pem'))
    };
  } catch {
    // Generate self-signed cert if none exists
    console.log('No SSL certificates found, using HTTP/WS');
    return null;
  }
}

export function startServer() {
  const sslOptions = hasSSL ? createSSLOptions() : null;
  
  let wss: WebSocketServer;
  
  if (sslOptions) {
    const server = createServer(sslOptions, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WebSocket Server Running');
    });
    wss = new WebSocketServer({ server });
    server.listen(SERVER_PORT, '0.0.0.0', () => {
      console.log('Server.started (WSS)', SERVER_URL);
    });
  } else {
    wss = new WebSocketServer({ port: SERVER_PORT, host: '0.0.0.0' });
    console.log('Server.started (WS)', SERVER_URL);
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

  wss.on('connection', (ws: WebSocket) => {
    console.log('Server.connection');
    clients.add(ws);
    ws.send(JSON.stringify({ count: requestCount }));
    
    ws.on('message', (data: any) => {
      console.log('Server.message', data.toString());
      requestCount++;
      broadcast({ count: requestCount });
    });
    
    ws.on('close', () => {
      console.log('Server.close');
      clients.delete(ws);
    });
  });
}
