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

### Quick Start

    npm run dev

This starts all services and automatically discovers any running browser/Steam instance to inject into.

### App Commands

    npm run app:browser          # Launch browser in development mode
    npm run app:steam            # Launch Steam app in development mode  
    npm run app:steam-gamepad    # Launch Steam app with gamepad UI
    npm run apps                 # Launch browser and Steam simultaneously

### Service Commands

    npm run service:frontend     # Start Vite dev server (http://localhost:3000)
    npm run service:server      # Start WebSocket server (ws://localhost:3001)
    npm run service:target     # Start target discovery and injection
    npm run services             # Start all services simultaneously

### How It Works

The target service automatically:
- Scans multiple debug ports (8080, 9222, 9223, 9224) for running browsers
- Discovers Steam-related pages by title and URL matching
- Injects React components with hot reload into discovered targets
- Falls back to launching a new browser if none found

## Directory structure

    /backend    -> Puppeteer automation and WebSocket server
    /frontend   -> Vite dev server and React components injected into Steam pages.

## Contact

For more information please contact kmturley
