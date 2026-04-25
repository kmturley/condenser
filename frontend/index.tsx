/// <reference types="vite/client" />

declare const __BACKEND_WS_ORIGIN__: string;
import React, { useState, useEffect } from 'react';
import { createLogger } from '../shared/logger';
import { createRoot } from 'react-dom/client';

const App: React.FC = () => {
  const [count, setCount] = useState(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    const logger = createLogger('frontend', isDev);
    if (isDev) {
      logger.info('Condenser loaded');
      document.body.style.border = '1px solid red';
    }

    const websocketUrl = __BACKEND_WS_ORIGIN__;
    if (isDev) {
      logger.info('Connecting to WebSocket:', websocketUrl);
    }

    const websocket = new WebSocket(websocketUrl);

    websocket.onopen = () => {
      if (isDev) {
        logger.info('WebSocket connected');
      }
    };

    websocket.onerror = (error) => {
      logger.error('WebSocket error:', error);
      if (isDev) {
        const certificateUrl = websocketUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        logger.info(`If this is a certificate issue, open ${certificateUrl} in a browser once.`);
      }
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (isDev) {
        logger.info('Client.message', data.count);
      }
      setCount(data.count);
    };

    setWs(websocket);

    return () => websocket.close();
  }, []);

  const handleClick = () => {
    if (ws) {
      ws.send(JSON.stringify({ action: 'click' }));
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
