import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

type SteamMode = 'desktop' | 'game';

const mode = getMode(process.argv.slice(2));
const executable = findSteamExecutable();
const args = [
  '-dev',
  '-windowed',
  '-cef-enable-debugging',
  ...(mode === 'game' ? ['-gamepadui'] : []),
];

if (!executable) {
  console.error('Unable to find the Steam executable for this platform.');
  console.error('Install Steam in the default location or add it to PATH and try again.');
  process.exit(1);
}

const child = spawn(executable.command, [...executable.args, ...args], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to launch Steam:', error);
  process.exit(1);
});

function getMode(args: string[]): SteamMode {
  return args[0] === 'desktop' ? 'desktop' : 'game';
}

function findSteamExecutable(): { command: string; args: string[] } | null {
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Steam.app/Contents/MacOS/steam_osx',
      join(homedir(), 'Applications', 'Steam.app', 'Contents', 'MacOS', 'steam_osx'),
    ];
    const match = candidates.find((candidate) => existsSync(candidate));
    return match ? { command: match, args: [] } : null;
  }

  if (process.platform === 'win32') {
    const candidates = [
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Steam', 'steam.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Steam', 'steam.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Steam', 'steam.exe'),
      'steam.exe',
    ].filter(Boolean);
    const match = candidates.find((candidate) => candidate === 'steam.exe' || existsSync(candidate));
    return match ? { command: match, args: [] } : null;
  }

  const linuxCandidates = [
    '/usr/bin/steam',
    '/usr/local/bin/steam',
    join(homedir(), '.local', 'share', 'Steam', 'steam.sh'),
    'steam',
  ];
  const match = linuxCandidates.find((candidate) => candidate === 'steam' || existsSync(candidate));
  return match ? { command: match, args: [] } : null;
}
