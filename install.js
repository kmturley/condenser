const { platform } = process;
const { execSync } = require('child_process');
const { copyFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname } = require('path');

const installPaths = {
  linux: '/opt/condenser',
  darwin: '/Applications/Condenser',
  win32: 'C:\\Program Files\\Condenser'
};

const serviceFiles = {
  linux: 'condenser.service',
  darwin: 'com.condenser.service.plist',
  win32: null // Handle separately
};

function install() {
  const targetPath = installPaths[platform];
  const exeName = platform === 'win32' ? 'condenser.exe' : 'condenser';
  const exePath = join(dirname(process.execPath), exeName);

  if (!existsSync(exePath)) {
    console.error('Executable not found:', exePath);
    process.exit(1);
  }

  // Copy executable
  mkdirSync(targetPath, { recursive: true });
  copyFileSync(exePath, join(targetPath, exeName));

  // Install service based on platform
  if (platform === 'linux') {
    const servicePath = join(targetPath, serviceFiles.linux);
    copyFileSync(join(dirname(process.execPath), serviceFiles.linux), servicePath);
    execSync(`sudo cp "${servicePath}" /etc/systemd/system/`);
    execSync('sudo systemctl daemon-reload');
    execSync('sudo systemctl enable condenser');
    execSync('sudo systemctl start condenser');
  } else if (platform === 'darwin') {
    const plistPath = join(targetPath, serviceFiles.darwin);
    copyFileSync(join(dirname(process.execPath), serviceFiles.darwin), plistPath);
    execSync(`sudo cp "${plistPath}" /Library/LaunchDaemons/`);
    execSync('sudo launchctl load /Library/LaunchDaemons/com.condenser.service.plist');
  } else if (platform === 'win32') {
    // For Windows, assume nssm is available or provide instructions
    try {
      execSync(`nssm install Condenser "${join(targetPath, exeName)}"`, { cwd: targetPath });
      execSync('nssm start Condenser');
    } catch (e) {
      console.log('nssm not found. Please install NSSM and run:');
      console.log(`nssm install Condenser "${join(targetPath, exeName)}"`);
      console.log('nssm start Condenser');
    }
  }

  console.log('Condenser installed successfully!');
  console.log('The service will automatically start monitoring for Steam browser instances.');
}

install();