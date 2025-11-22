import React, { useState, useEffect } from 'react';
import { CondenserFrontend } from '../../core/frontend/CondenserFrontend';
import { config } from './Config';

export class Frontend extends CondenserFrontend {
  constructor() {
    super(config);
  }
  
  render() {
    return <ExampleComponent frontend={this} />;
  }
}

function ExampleComponent({ frontend }: { frontend: Frontend }) {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    console.log('Condenser loaded!');
    document.body.style.border = '1px solid red';
    
    // Set up message handlers
    frontend.onMessage('count', (data) => {
      console.log('Client.message', data);
      setCount(data.count);
    });
    
    // Send init message to get current count
    frontend.sendMessage('init', {});
    setConnected(true);
  }, []);

  const handleClick = () => {
    frontend.sendMessage('click', {});
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
}

