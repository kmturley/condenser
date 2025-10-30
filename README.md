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

### Development Mode (Launch Browser)

    npm run dev

This will:
- Start Vite dev server on `http://localhost:3000`
- Start WebSocket server on `ws://localhost:3001`
- Launch Chrome browser and navigate to Steam store
- Inject React components with hot reload

### App Mode (Connect to Steam App)

First, launch Steam with debugging enabled:

    npm run steam

Then run the dev app mode:

    npm run dev:app

This will:
- Start Vite dev server on `http://localhost:3000`
- Start WebSocket server on `ws://localhost:3001`
- Connect to existing Steam browser instance on port 8080
- Inject React components into Steam store pages

## Directory structure

    /backend    -> Puppeteer automation and WebSocket server
    /frontend   -> Vite dev server and React components injected into Steam pages.

## Contact

For more information please contact kmturley
