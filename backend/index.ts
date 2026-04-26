import { getModeFromArg } from '../shared/runtime.js';
import { startServer } from './server.js';

startServer(getModeFromArg(process.argv.slice(2)));
