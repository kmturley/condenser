# Condenser (prototype)

> Turns Steam 💨 into liquid 💧!

A development tool that injects React components into Steam web pages using Puppeteer and WebSocket communication.

![Condenser](/condenser-screenshot.jpg)
Condenser injected into Browser, App and Steam Deck.

## Features

- **Browser Automation**: Uses Puppeteer to control Chrome/Steam browser instances
- **Code Injection**: Injects React components with hot reload into Steam store pages
- **WebSocket Communication**: Real-time communication between injected frontend and backend
- **CSP Bypass**: Automatically modifies Content Security Policy headers for injection
- **Dual Mode**: Launch new browser or connect to existing Steam browser

## Comparison vs existing solutions

[Decky loader](https://decky.xyz/) for Steam Deck and [Millenium](https://steambrew.app/) for Desktop PCs already good a great job, however they have limitations and require separate plugins. Condenser is an attempt to unify the functionality into a single full-stack project.

| Feature | **Condenser** | Decky | Millennium |
|---------|---------------|-------|------------|
| **Platform** | Any Steam + Steam Deck | Steam Deck only | Windows/Linux Steam |
| **Language** | TypeScript/Node.js | Python + TypeScript | C++ + TypeScript |
| **Hot Reload** | ✅ React Fast Refresh | ❌ Manual restart | ❌ Build required |
| **Cross-Platform Dev** | ✅ Windows/macOS/Linux | ❌ SteamOS only | ❌ Windows/Linux only |
| **Setup** | `npm install` | Linux VM required | C++ build tools |
| **Dependencies** | Node.js only | Python ecosystem | C++ runtime |
| **Plugin Creation** | 3 files, <50 lines | Template-based | Template + build |
| **Performance** | Fast | Medium | Fastest |
| **Development Speed** | Instant (HMR) | Slow (restart) | Slow (build) |

**Condenser's Unique Advantages:**
- Only system with instant hot reload for rapid development
- True cross-platform development (works on any OS)
- Minimal dependencies and setup complexity
- Dynamic configuration with no hardcoded values

## Installation

    npm install

Trusted HTTPS/WSS development certificates require `mkcert`.

## Usage

### Certificate Commands

Generate trusted certificates for https/wss local server:

    npm run setup               # Install local mkcert trust and generate desktop certificates on this machine
    npm run setup:remote        # Install local mkcert trust, generate remote certificates, and install trust on the Steam Deck
    npm run setup:local         # Generate deck-local certificates on the Steam Deck and install trust there

### App Commands

    npm run app                 # Launch the Steam desktop app in game mode
    npm run app:desktop         # Launch the Steam desktop app in desktop mode
    npm run app:browser         # Launch browser in development mode

### Service Commands

    npm run dev                 # Start the frontend and backend dev services for desktop development
    npm run dev:remote          # Start the frontend and backend dev services on the PC for Steam Deck remote development
    npm run dev:local           # Start the frontend and backend dev services on the Steam Deck for deck-local development

### How It Works

The target service automatically:

- Scans the configured Steam and browser remote-debugging endpoints for running targets
- Discovers Steam-related pages by title and URL matching
- Injects React components with hot reload into discovered targets

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

**For desktop development on your PC:**
```bash
npm run setup
```

**For Steam Deck connecting to services running on your PC:**
```bash
npm run setup:remote
```

**For services running on the Steam Deck: run this on the Steam Deck itself:**
```bash
npm run setup:local
```

### 4. Start Development
**Desktop development on your PC:**
```bash
npm run app
npm run dev
```

**Steam Deck using services on your PC:**
```bash
npm run dev:remote
```
Launch Steam on the Deck with developer tools enabled.

**Steam Deck with services running locally on the Deck:**
```bash
npm run dev:local
```
Launch Steam on the Deck with developer tools enabled.

## Directory structure

    /backend    -> Puppeteer automation and WebSocket server
    /frontend   -> Vite dev server and React components injected into Steam pages.

## Contact

For more information please contact kmturley
