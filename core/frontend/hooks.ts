import { useState, useEffect, useCallback } from 'react';
import { PluginMessage } from '../shared/types';

export function useWebSocket(serverUrl: string) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const websocket = new WebSocket(serverUrl);
    
    websocket.onopen = () => {
      setConnected(true);
      setWs(websocket);
    };
    
    websocket.onclose = () => {
      setConnected(false);
      setWs(null);
    };
    
    return () => {
      websocket.close();
    };
  }, [serverUrl]);

  const sendMessage = useCallback((message: PluginMessage) => {
    if (ws && connected) {
      ws.send(JSON.stringify(message));
    }
  }, [ws, connected]);

  return { ws, connected, sendMessage };
}

export function usePluginMessage(
  ws: WebSocket | null, 
  namespace: string, 
  messageType: string, 
  handler: (payload: any) => void
) {
  useEffect(() => {
    if (!ws) return;

    const messageHandler = (event: MessageEvent) => {
      try {
        const message: PluginMessage = JSON.parse(event.data);
        if (message.namespace === namespace && message.type === messageType) {
          handler(message.payload);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    ws.addEventListener('message', messageHandler);
    return () => ws.removeEventListener('message', messageHandler);
  }, [ws, namespace, messageType, handler]);
}