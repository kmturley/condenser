import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { hostname, networkInterfaces } from 'os';

export type Mode = 'local' | 'remote';

export interface RuntimeConfig {
  mode: Mode;
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

export function getModeFromArg(args: string[]): Mode {
  const modeFlag = args.findIndex((value) => value === '--mode');
  const mode = modeFlag >= 0 ? args[modeFlag + 1] : args[0];
  if (mode === 'local' || mode === 'remote') {
    return mode;
  }
  return 'local';
}

export function getRuntimeConfig(mode: Mode): RuntimeConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const publicHost = getPublicHost(mode);
  const certPath = join(process.cwd(), 'certs', `${mode}.cert.pem`);
  const keyPath = join(process.cwd(), 'certs', `${mode}.key.pem`);
  const tlsEnabled = existsSync(certPath) && existsSync(keyPath);
  const httpProtocol = tlsEnabled ? 'https' : 'http';
  const wsProtocol = tlsEnabled ? 'wss' : 'ws';
  const frontendOrigin = `${httpProtocol}://${publicHost}:${FRONTEND_PORT}`;
  const backendHttpOrigin = `${httpProtocol}://${publicHost}:${BACKEND_PORT}`;
  const backendWsOrigin = `${wsProtocol}://${publicHost}:${BACKEND_PORT}`;
  const frontendWsOrigin = `${wsProtocol}://${publicHost}:${FRONTEND_PORT}`;
  const allowedOrigins = unique([
    frontendOrigin,
    STEAM_STORE_ORIGIN,
    STEAM_COMMUNITY_ORIGIN,
    STEAM_LOOPBACK_ORIGIN,
    STEAM_LOOPBACK_HTTP_ORIGIN,
    STEAM_HOSTNAME_ORIGIN,
    `${httpProtocol}://localhost:${FRONTEND_PORT}`,
    mode === 'remote' ? `${httpProtocol}://${publicHost}:${FRONTEND_PORT}` : null,
  ]);

  return {
    mode,
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
    allowedHosts: getAllowedHosts(mode, publicHost),
    connectSrc: unique([
      "'self'",
      frontendOrigin,
      backendHttpOrigin,
      backendWsOrigin,
      frontendWsOrigin,
      wsProtocol === 'wss'
        ? `ws://${publicHost}:${BACKEND_PORT}`
        : `wss://${publicHost}:${BACKEND_PORT}`,
      mode !== 'remote' ? `ws://localhost:${BACKEND_PORT}` : null,
      mode !== 'remote' ? `wss://localhost:${BACKEND_PORT}` : null,
    ]),
    debugTargets: getDebugTargets(mode),
    certPath,
    keyPath,
    certNames: getCertNames(mode, publicHost),
  };
}

export function getTlsOptions(mode: Mode) {
  const config = getRuntimeConfig(mode);
  if (!existsSync(config.certPath) || !existsSync(config.keyPath)) {
    return undefined;
  }

  return {
    key: readFileSync(config.keyPath),
    cert: readFileSync(config.certPath),
  };
}

export function getPublicHost(mode: Mode): string {
  if (mode === 'remote') {
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

function getAllowedHosts(mode: Mode, publicHost: string): string[] {
  return unique([
    'localhost',
    '127.0.0.1',
    '::1',
    'steamloopback.host',
    publicHost,
    mode === 'remote' ? 'steamdeck' : null,
  ]);
}

function getDebugTargets(mode: Mode): string[] {
  if (mode === 'remote') {
    return [
      'http://steamdeck:8081',
      'http://steamdeck:8080',
    ];
  }

  return [
    'http://localhost:8080',
    'http://localhost:9222',
  ];
}

function getCertNames(mode: Mode, publicHost: string): string[] {
  return unique([
    'localhost',
    '127.0.0.1',
    '::1',
    mode === 'remote' ? publicHost : null,
    mode === 'remote' ? 'steamdeck' : null,
  ]);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
