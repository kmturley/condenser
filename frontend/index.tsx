/// <reference types="vite/client" />

import { PluginLoader } from '../core/frontend/PluginLoader';

console.log('Condenser plugin system initializing...');

// Initialize plugin system
const pluginLoader = new PluginLoader();

// Load plugins when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, loading plugins...');
    pluginLoader.loadPlugins();
  });
} else {
  console.log('DOM already ready, loading plugins...');
  pluginLoader.loadPlugins();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  pluginLoader.unloadAll();
});

console.log('Condenser plugin system initialized');
