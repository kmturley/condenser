/// <reference types="vite/client" />

import { createRoot } from 'react-dom/client';
import App from './App';

let container = document.getElementById('condenser-root');
if (!container) {
  container = document.createElement('div');
  container.id = 'condenser-root';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<App />);
}
