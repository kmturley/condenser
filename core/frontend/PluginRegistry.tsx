// Static plugin registry for Vite compatibility
import { Frontend as ExampleFrontend } from '../../plugins/example/Frontend';

export const pluginRegistry = {
  'example': ExampleFrontend
};

export function getPluginFrontend(pluginName: string) {
  return pluginRegistry[pluginName as keyof typeof pluginRegistry];
}