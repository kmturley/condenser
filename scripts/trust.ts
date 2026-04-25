import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { getRuntimeConfig, getTopologyFromArg } from '../shared/runtime';

type TrustTarget = 'local' | 'deck';

const args = process.argv.slice(2);
const target = getTarget(args);

if (target === 'local') {
  run('mkcert', ['-install']);
  process.exit(0);
}

const topology = getTopologyFromArg(args.slice(1));
const config = getRuntimeConfig(topology);
const steamDeckHost = args[2] ?? 'steamdeck';
const caroot = capture('mkcert', ['-CAROOT']);
const caCertPath = `${caroot}/rootCA.pem`;

if (!existsSync(caCertPath)) {
  console.error(`mkcert CA not found at ${caCertPath}. Run the certificate command first.`);
  process.exit(1);
}

run('ssh', ['-o', 'ConnectTimeout=5', `deck@${steamDeckHost}`, "echo 'SSH connection successful'"]);
run('scp', [caCertPath, `deck@${steamDeckHost}:/tmp/condenser-rootCA.pem`]);
run('ssh', ['-t', `deck@${steamDeckHost}`, 'sudo cp /tmp/condenser-rootCA.pem /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt']);
run('ssh', ['-t', `deck@${steamDeckHost}`, 'sudo trust extract-compat']);
run('ssh', [`deck@${steamDeckHost}`, 'mkdir -p ~/.pki/nssdb']);
run('ssh', [
  `deck@${steamDeckHost}`,
  "certutil -d sql:~/.pki/nssdb -A -n 'Condenser Development CA' -t 'TCu,Cu,Tu' -i /tmp/condenser-rootCA.pem || true",
]);
run('ssh', [`deck@${steamDeckHost}`, 'rm /tmp/condenser-rootCA.pem']);

console.log(`Steam Deck trust updated for ${topology}. Test ${config.frontendOrigin} and ${config.backendHttpOrigin} from the Deck.`);

function getTarget(values: string[]): TrustTarget {
  return values[0] === 'deck' ? 'deck' : 'local';
}

function capture(command: string, commandArgs: string[]): string {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function run(command: string, commandArgs: string[]) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
