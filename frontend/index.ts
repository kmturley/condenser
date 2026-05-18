/// <reference lib="dom" />

// Evaluated in Steam's SharedJSContext via native ESM import().
// The backend bootstraps this file via CDP: await import('.../frontend/index.ts?t=...')

import * as tree    from './library/tree.js';
import * as steam   from './library/steam.js';
import * as qam     from './library/qam.js';
import * as plugins from './library/loader.js';
import { boot, installPreamble } from './library/boot.js';

const condenser: any = ((window as any).__condenser ||= { core: {}, components: {} });
condenser.tree    = tree;
condenser.steam   = steam;
condenser.qam     = qam;
condenser.plugins = plugins;

installPreamble();
boot();
