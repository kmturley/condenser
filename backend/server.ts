import WebSocket, { WebSocketServer } from 'ws';

const port: number = 3001;
let requestCount = 0;

export function startServer() {
  const wss = new WebSocketServer({ port });
  console.log('Server.started', `ws://localhost:${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Server.connection');
    ws.send(JSON.stringify({ count: requestCount }));
    ws.on('message', (data: any) => {
      console.log('Server.message', data.toString());
      requestCount++;
      ws.send(JSON.stringify({ count: requestCount }));
    });
    ws.on('close', () => {
      console.log('Server.close');
    });
  });
}
