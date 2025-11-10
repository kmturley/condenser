/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const App: React.FC = () => {
  const [count, setCount] = useState(0);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    console.log('Condenser loaded!');
    document.body.style.border = '1px solid red';

    // Connect to development server WebSocket
    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'wss:' : 'ws:';
    // Always connect to localhost for development, or detect dev server IP
    const devServerHost = 'localhost'; // Could be made configurable
    const websocketUrl = `${protocol}//${devServerHost}:3001`;
    console.log('Connecting to WebSocket:', websocketUrl);
    
    const websocket = new WebSocket(websocketUrl);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
    };
    
    websocket.onerror = (error) => {
      console.log('WebSocket error:', error);
      console.log('Try visiting https://localhost:3001 in your browser and accepting the certificate');
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Client.message', data.count);
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
