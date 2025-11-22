import { PluginConfig } from '../../core/shared/types';

export const config: PluginConfig = {
  name: 'example',
  namespace: 'example',
  targetPages: [
    { url: /store\.steampowered\.com/ },
    { title: 'Steam Big Picture Mode' },
    { title: 'Welcome to Steam' }
  ],
  targetUrls: [
    'https://store.steampowered.com/'
  ],
  mountSelector: '#content',
  serverUrl: 'auto',
  duplicateCheck: 'window.condenserHasLoaded'
};