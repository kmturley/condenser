import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { hostname, networkInterfaces } from 'os';

export type Topology = 'desktop' | 'deck-remote' | 'deck-local';

export interface RuntimeConfig {
  topology: Topology;
  nodeEnv: string;
  isProduction: boolean;
  enableDebugLogs: boolean;
  frontendPort: number;
  backendPort: number;
  bindHost: string;
  publicHost: string;
  frontendOrigin: string;
  backendHttpOrigin: string;
  backendWsOrigin: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  connectSrc: string[];
  debugTargets: string[];
  certPath: string;
  keyPath: string;
  certNames: string[];
}

const FRONTEND_PORT = 3000;
const BACKEND_PORT = 3001;
const STEAM_STORE_ORIGIN = 'https://store.steampowered.com';
const STEAM_COMMUNITY_ORIGIN = 'https://steamcommunity.com';
const STEAM_LOOPBACK_ORIGIN = 'https://steamloopback.host';
const STEAM_LOOPBACK_HTTP_ORIGIN = 'http://steamloopback.host';
const STEAM_HOSTNAME_ORIGIN = 'https://steamloopback.host:443';

export function getTopologyFromArg(args: string[]): Topology {
  const topologyFlag = args.findIndex((value) => value === '--topology');
  const topology = topologyFlag >= 0 ? args[topologyFlag + 1] : args[0];
  if (topology === 'desktop' || topology === 'deck-remote' || topology === 'deck-local') {
    return topology;
  }
  return 'desktop';
}

export function getRuntimeConfig(topology: Topology): RuntimeConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const publicHost = getPublicHost(topology);
  const certPath = join(process.cwd(), 'certs', `${topology}.cert.pem`);
  const keyPath = join(process.cwd(), 'certs', `${topology}.key.pem`);
  const tlsEnabled = existsSync(certPath) && existsSync(keyPath);
  const httpProtocol = tlsEnabled ? 'https' : 'http';
  const wsProtocol = tlsEnabled ? 'wss' : 'ws';
  const frontendOrigin = `${httpProtocol}://${publicHost}:${FRONTEND_PORT}`;
  const backendHttpOrigin = `${httpProtocol}://${publicHost}:${BACKEND_PORT}`;
  const backendWsOrigin = `${wsProtocol}://${publicHost}:${BACKEND_PORT}`;
  const allowedOrigins = unique([
    frontendOrigin,
    STEAM_STORE_ORIGIN,
    STEAM_COMMUNITY_ORIGIN,
    STEAM_LOOPBACK_ORIGIN,
    STEAM_LOOPBACK_HTTP_ORIGIN,
    STEAM_HOSTNAME_ORIGIN,
    `${httpProtocol}://localhost:${FRONTEND_PORT}`,
    topology === 'deck-remote' ? `${httpProtocol}://${publicHost}:${FRONTEND_PORT}` : null,
  ]);

  return {
    topology,
    nodeEnv,
    isProduction,
    enableDebugLogs: !isProduction,
    frontendPort: FRONTEND_PORT,
    backendPort: BACKEND_PORT,
    bindHost: '0.0.0.0',
    publicHost,
    frontendOrigin,
    backendHttpOrigin,
    backendWsOrigin,
    allowedOrigins,
    allowedHosts: getAllowedHosts(topology, publicHost),
    connectSrc: unique([
      "'self'",
      frontendOrigin,
      backendHttpOrigin,
      backendWsOrigin,
      wsProtocol === 'wss'
        ? `ws://${publicHost}:${BACKEND_PORT}`
        : `wss://${publicHost}:${BACKEND_PORT}`,
      topology !== 'deck-remote' ? `ws://localhost:${BACKEND_PORT}` : null,
      topology !== 'deck-remote' ? `wss://localhost:${BACKEND_PORT}` : null,
    ]),
    debugTargets: getDebugTargets(topology),
    certPath,
    keyPath,
    certNames: getCertNames(topology, publicHost),
  };
}

export function getTlsOptions(topology: Topology) {
  const config = getRuntimeConfig(topology);
  if (!existsSync(config.certPath) || !existsSync(config.keyPath)) {
    return false;
  }

  return {
    key: readFileSync(config.keyPath),
    cert: readFileSync(config.certPath),
  };
}

export function getPublicHost(topology: Topology): string {
  if (topology === 'deck-remote') {
    return getPrimaryIpv4() ?? hostname();
  }

  return 'localhost';
}

export function getPrimaryIpv4(): string | null {
  const networks = networkInterfaces();
  for (const network of Object.values(networks)) {
    for (const details of network ?? []) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }

  return null;
}

function getAllowedHosts(topology: Topology, publicHost: string): string[] {
  return unique([
    'localhost',
    '127.0.0.1',
    '::1',
    'steamloopback.host',
    publicHost,
    topology === 'deck-local' ? 'steamdeck' : null,
  ]);
}

function getDebugTargets(topology: Topology): string[] {
  if (topology === 'deck-remote') {
    return [
      'http://steamdeck:8081',
      'http://steamdeck:8080',
    ];
  }

  if (topology === 'deck-local') {
    return [
      'http://localhost:8081',
      'http://localhost:8080',
      'http://localhost:9222',
    ];
  }

  return [
    'http://localhost:8080',
    'http://localhost:9222',
  ];
}

function getCertNames(topology: Topology, publicHost: string): string[] {
  return unique([
    'localhost',
    '127.0.0.1',
    '::1',
    topology === 'deck-remote' ? publicHost : null,
    topology === 'deck-local' ? 'steamdeck' : null,
    topology === 'deck-local' ? getPrimaryIpv4() : null,
  ]);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
