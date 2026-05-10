/// <reference types="vite/client" />

// Standalone test entry point — used by Vite at https://localhost:3000.
// Steam injection bypasses this file entirely and loads ./components directly
// via ts.transpileModule in backend/target.ts.

import React from 'react';
import { createRoot } from 'react-dom/client';
import Counter from './components/Counter';

declare const CONDENSER_URL: string;

let container = document.getElementById('condenser-test-root');
if (!container) {
  container = document.createElement('div');
  container.id = 'condenser-test-root';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(Counter, { React, websocketUrl: CONDENSER_URL }));
}
