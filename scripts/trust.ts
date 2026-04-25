import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { getRuntimeConfig, getModeFromArg } from '../shared/runtime';

type TrustTarget = 'local' | 'deck';

const args = process.argv.slice(2);
const target = getTarget(args);

if (target === 'local') {
  run('mkcert', ['-install']);
  process.exit(0);
}

const mode = getModeFromArg(args.slice(1));
const config = getRuntimeConfig(mode);
const steamDeckHost = args[2] ?? 'steamdeck';
const caroot = capture('mkcert', ['-CAROOT']);
const caCertPath = `${caroot}/rootCA.pem`;

if (!existsSync(caCertPath)) {
  console.error(`mkcert CA not found at ${caCertPath}. Run the certificate command first.`);
  process.exit(1);
}

installDeckTrust(steamDeckHost, caCertPath);

console.log(`\n✅ Steam Deck trust updated for ${mode}.`);
console.log(`   Test ${config.frontendOrigin} and ${config.backendHttpOrigin} from the Deck.`);

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

function run(command: string, commandArgs: string[], input?: string) {
  const result = spawnSync(command, commandArgs, {
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: input ?? undefined,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function installDeckTrust(steamDeckHost: string, caCertPath: string) {
  const caCert = readFileSync(caCertPath, 'utf8');

  // Step 1: Copy CA cert to Steam Deck
  console.log(`\n📤 Step 1: Copying CA certificate to ${steamDeckHost}...`);
  const copyScript = `set -eu
TMP_CA=/tmp/condenser-rootCA.pem
cat > "$TMP_CA" <<'EOF_CA'
${caCert.trim()}
EOF_CA
echo "CA copied"
`;
  run('ssh', ['-t', 'deck@' + steamDeckHost, 'sh'], copyScript);

  // Step 2: System trust store
  console.log(`\n📤 Step 2: Installing to system trust store (enter password)...`);
  const installScript = `set -eu
sudo cp /tmp/condenser-rootCA.pem /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt
sudo trust extract-compat
echo "System trust done"
`;
  run('ssh', ['deck@' + steamDeckHost, 'tee /tmp/condenser-install.sh'], installScript);
  run('ssh', ['-t', 'deck@' + steamDeckHost, 'sh', '/tmp/condenser-install.sh']);

  // Step 3: Browser trust store
  console.log(`\n📤 Step 3: Installing to browser trust store...`);
  const browserScript = `set -eu
    mkdir -p ~/.pki/nssdb
    if [ ! -f ~/.pki/nssdb/cert9.db ]; then
      certutil -N -d sql:$HOME/.pki/nssdb --empty-password
    fi
    # Remove old cert if present
    certutil -d sql:$HOME/.pki/nssdb -D -n "Condenser Development CA" || true
    certutil -d sql:$HOME/.pki/nssdb -A -n "Condenser Development CA" -t "TCu,Cu,Tu" -i /tmp/condenser-rootCA.pem
    rm /tmp/condenser-rootCA.pem
    echo "Browser trust done"
    `;
  run('ssh', ['deck@' + steamDeckHost, 'tee /tmp/condenser-browser.sh'], browserScript);
  run('ssh', ['-t', 'deck@' + steamDeckHost, 'sh', '/tmp/condenser-browser.sh']);

  // Step 4: Verify
  console.log(`\n🔍 Verifying...`);
  const verifyScript = `set -eu
[ -f /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt ] && echo "✅ System trust" || echo "❌ System trust"
certutil -d sql:$HOME/.pki/nssdb -L | grep -q "Condenser" && echo "✅ Browser trust" || echo "❌ Browser trust"
`;
  run('ssh', ['deck@' + steamDeckHost, 'tee /tmp/condenser-verify.sh'], verifyScript);
  run('ssh', ['-t', 'deck@' + steamDeckHost, 'sh', '/tmp/condenser-verify.sh']);
}
