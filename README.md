# Condenser (prototype)

> Turns Steam 💨 into liquid 💧!

A development tool that injects React components into Steam web pages using Puppeteer and WebSocket communication.

## Features

- **Browser Automation**: Uses Puppeteer to control Chrome/Steam browser instances
- **Code Injection**: Injects React components with hot reload into Steam store pages
- **WebSocket Communication**: Real-time communication between injected frontend and backend
- **CSP Bypass**: Automatically modifies Content Security Policy headers for injection
- **Dual Mode**: Launch new browser or connect to existing Steam browser

## Installation

    npm install

## Usage

### Certificate Commands

Generate trusted certificates for https/wss local server:

    npm run certs:local         # Generates localhost certificates and installs them locally
    npm run certs:steamdeck     # Generates IP-based certificates and installs them on Steam Deck via SSH
    npm run certs               # Generates and installs certificates for both environments

### App Commands

    npm run app:browser         # Launch browser in development mode
    npm run app:steam           # Launch Steam app in development mode  
    npm run app:steam-gamepad   # Launch Steam app with gamepad UI
    npm run apps                # Launch browser and Steam simultaneously

### Service Commands

    npm run service:frontend    # Start Vite dev server (http://localhost:3000)
    npm run service:server      # Start WebSocket server (ws://localhost:3001)
    npm run service:target      # Start target discovery and injection
    npm run services            # Start all services simultaneously

### How It Works

The target service automatically:

- Scans multiple debug ports (8080, 9222, 9223, 9224) for running browsers
- Discovers Steam-related pages by title and URL matching
- Injects React components with hot reload into discovered targets
- Falls back to launching a new browser if none found

## Steam Deck Setup

To use Condenser with Steam Deck, you need to enable developer tools and SSH access:

### 1. Enable Developer Mode
1. Go to **Settings** → **System** → **Developer**
2. Enable **Developer Mode**
3. Enable **CEF Remote Debugging**

### 2. Setup SSH Access
1. Switch to **Desktop Mode** (hold power button → Switch to Desktop)
2. Open **Konsole** (terminal)
3. Set password for deck user:
   ```bash
   passwd
   ```
4. Enable SSH service:
   ```bash
   sudo systemctl enable sshd
   sudo systemctl start sshd
   ```
5. Test SSH from your development machine:
   ```bash
   ssh deck@steamdeck
   ```

### 3. Generate and Install Certificates

**For both local and Steam Deck development (recommended):**
```bash
npm run certs
```

This enables HTTPS/WSS connections without certificate errors on both local development and Steam Deck.

### 4. Start Development
```bash
npm run services
```

Condenser will automatically discover and inject into Steam Deck's browser when it's running in developer mode.

## Directory structure

    /backend    -> Puppeteer automation and WebSocket server
    /frontend   -> Vite dev server and React components injected into Steam pages.

## Contact

For more information please contact kmturley
