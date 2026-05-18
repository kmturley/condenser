import { getModeFromArg } from '../shared/runtime.js';
import { startDiscovery } from './library/target.js';

startDiscovery(getModeFromArg(process.argv.slice(2)));
