import WebSocket, { WebSocketServer } from 'ws';

const port: number = 27060;

export function startServer() {
  const wss = new WebSocketServer({ port });
  console.log('Server.started', `ws://localhost:${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Server.connection', ws);
    ws.on('message', (data: any) => {
      console.log('Server.message', data);
    });
    ws.on('close', () => {
      console.log('Server.close');
    });
  });
}
