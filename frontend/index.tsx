/// <reference types="vite/client" />

declare const CONDENSER_URL: string;
declare const CONDENSER_DEBUG: boolean;
import React, { useState, useEffect } from 'react';
import { createLogger } from '../shared/logger';
import { createRoot } from 'react-dom/client';

const App: React.FC = () => {
  const [count, setCount] = useState(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    const logger = createLogger('frontend', CONDENSER_DEBUG);
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const websocketUrl = CONDENSER_URL;
      logger.info('Connecting to WebSocket:', websocketUrl);

      socket = new WebSocket(websocketUrl);

      socket.onopen = () => {
        logger.info('WebSocket connected');
        setWs(socket);
      };

      socket.onerror = (error) => {
        logger.error('WebSocket error:', error);
        const certificateUrl = websocketUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        logger.info(`If this is a certificate issue, open ${certificateUrl} in a browser once.`);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        logger.info('Client.message', data.count);
        setCount(data.count);
      };

      socket.onclose = () => {
        logger.info('WebSocket disconnected. Retrying in 3s...');
        setWs(null);
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    logger.info('Condenser loaded');
    document.body.style.border = '1px solid red';

    connect();

    return () => {
      socket?.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleClick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'click2' }));
    } else {
      console.warn('Cannot send: WebSocket is not open.');
    }
  };

  return (
    <div>
      <h1>Condenser Frontend</h1>
      <button 
        onClick={handleClick}
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 1000
        }}
      >
        Send Request {count > 0 && `(${count})`}
      </button>
    </div>
  );
};

const container = document.createElement('div');
container.id = 'react-app';
document.body.appendChild(container);
const root = createRoot(container);
root.render(<App />);
