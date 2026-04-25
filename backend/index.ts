import { getModeFromArg } from '../shared/runtime';
import { startServer } from './server';

startServer(getModeFromArg(process.argv.slice(2)));
