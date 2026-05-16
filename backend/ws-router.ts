import WebSocket from 'ws';

export const MessageType = {
  CALL: 0,
  REPLY: 1,
  EVENT: 3,
} as const;

type Handler = (params: unknown, ws: WebSocket) => Promise<unknown> | unknown;

export class WsRouter {
  private readonly routes = new Map<string, Handler>();

  register(route: string, handler: Handler): this {
    this.routes.set(route, handler);
    return this;
  }

  async handle(raw: string, ws: WebSocket): Promise<void> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== MessageType.CALL) return;

    const handler = this.routes.get(msg.route);
    if (!handler) {
      ws.send(JSON.stringify({ type: MessageType.REPLY, id: msg.id, error: `Unknown route: ${msg.route}` }));
      return;
    }
    try {
      const result = await handler(msg.params, ws);
      ws.send(JSON.stringify({ type: MessageType.REPLY, id: msg.id, result }));
    } catch (e: any) {
      ws.send(JSON.stringify({ type: MessageType.REPLY, id: msg.id, error: e.message }));
    }
  }
}

export function broadcastEvent(
  clients: Set<WebSocket>,
  event: string,
  payload: Record<string, unknown> = {},
): void {
  const data = JSON.stringify({ type: MessageType.EVENT, event, ...payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
