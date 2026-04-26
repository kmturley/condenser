import { mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { getRuntimeConfig, getModeFromArg } from '../shared/runtime.js';

const mode = getModeFromArg(process.argv.slice(2));
const config = getRuntimeConfig(mode);

if (!commandExists('mkcert')) {
  console.error('mkcert is required for development certificates. Install mkcert and run this command again.');
  process.exit(1);
}

mkdirSync('certs', { recursive: true });

run('mkcert', [
  '-key-file',
  config.keyPath,
  '-cert-file',
  config.certPath,
  ...config.certNames,
]);

console.log(`Generated ${mode} certificate for: ${config.certNames.join(', ')}`);

function commandExists(command: string): boolean {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
