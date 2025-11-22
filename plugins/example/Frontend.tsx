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
  const [message, setMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    console.log('ExampleComponent mounted');
    // Set up message handlers
    frontend.onMessage('countUpdated', (data) => {
      setCount(data.count);
      setLastUpdate(data.timestamp || '');
    });
    
    // Get initial data
    frontend.sendMessage('getData', {});
    setConnected(true);
  }, []);

  const handleIncrement = () => {
    frontend.sendMessage('increment', { amount: 1 });
  };

  const handleIncrementBy5 = () => {
    frontend.sendMessage('increment', { amount: 5 });
  };

  const handleReset = () => {
    frontend.sendMessage('reset', {});
  };

  const handleGetData = () => {
    frontend.sendMessage('getData', {});
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      right: '10px', 
      background: 'rgba(0,0,0,0.9)', 
      color: 'white', 
      padding: '15px', 
      borderRadius: '8px',
      zIndex: 9999,
      minWidth: '200px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px'
    }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#4CAF50' }}>Example Plugin</h3>
      <div style={{ marginBottom: '10px' }}>
        <strong>Status:</strong> {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <strong>Count:</strong> {count}
      </div>
      {lastUpdate && (
        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#ccc' }}>
          Last update: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <button onClick={handleIncrement} style={buttonStyle}>+1</button>
        <button onClick={handleIncrementBy5} style={buttonStyle}>+5</button>
        <button onClick={handleReset} style={{ ...buttonStyle, backgroundColor: '#f44336' }}>Reset</button>
        <button onClick={handleGetData} style={{ ...buttonStyle, backgroundColor: '#2196F3' }}>Refresh</button>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '8px 12px',
  backgroundColor: '#4CAF50',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px'
};