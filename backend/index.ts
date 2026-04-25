import { getTopologyFromArg } from '../shared/runtime';
import { startServer } from './server';

startServer(getTopologyFromArg(process.argv.slice(2)));
