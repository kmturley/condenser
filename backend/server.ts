import WebSocket, { WebSocketServer } from 'ws';

export const SERVER_PORT: number = 3001;
export const SERVER_URL: string = `ws://localhost:${SERVER_PORT}`;

export function startServer() {
  const wss = new WebSocketServer({ port: SERVER_PORT });
  console.log('Server.started', SERVER_URL);
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
