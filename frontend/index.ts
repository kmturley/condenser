/// <reference lib="dom" />

import * as tree    from './helpers/tree.js';
import * as steam   from './helpers/steam.js';
import * as qam     from './helpers/qam.js';
import * as plugins from './helpers/plugin-loader.js';

const condenser: any = ((window as any).__condenser ||= { core: {}, shared: {}, components: {} });
condenser.tree    = tree;
condenser.steam   = steam;
condenser.qam     = qam;
condenser.plugins = plugins;
