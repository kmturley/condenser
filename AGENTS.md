# Debugging the Steam App

This guide explains how to connect to the running Steam app for debugging using Chrome DevTools.

## Prerequisites

Steam must have been launched in debug mode via:

```bash
npm run app  # Game mode (Big Picture / Steam Deck UI)
```

This starts Steam with the `-cef-enable-debugging` flag, which exposes a Chrome DevTools Protocol (CDP) endpoint on `http://localhost:8080`.

Assume the app is already running and probe for ports, if not running prompt the user to run the app in debug mode.

## 1. Open Chrome DevTools Inspector

Fetch `http://localhost:8080/json` to retrieve the list of active CEF debug targets. Each entry contains a `webSocketDebuggerUrl` to connect to via the Chrome DevTools Protocol and a `title` to identify the window.

## 2. Choose the Right Window

Steam runs several windows simultaneously. Connect to the one that matches what you need to debug:

### SharedJSContext (default — start here)

**Title:** `SharedJSContext` or `Steam Shared Context presented by Valve™`  
**URL:** `https://steamloopback.host/routes/` or `https://steamloopback.host/index.html`

This is the primary JavaScript runtime for the entire Steam UI. It hosts:

- The Steam UI Redux store and all webpack-bundled UI modules (`window.webpackChunksteamui`)
- The React instance used by every visible panel
- The Condenser injection point — all component mounting, hot reload, and window messaging runs here

**Start here for:** JavaScript errors, injection failures, Redux state, WebSocket communication issues, and anything in [backend/target.ts](backend/target.ts).

### QuickAccess

**Title:** `QuickAccess_uid*`  
**URL:** `about:blank?browserviewpopup=1`

The Quick Access overlay panel (opened by the `...` button on a Steam Deck or the system tray icon). Condenser injects its tab here by patching `QuickAccessMenuBrowserView` in SharedJSContext. This window has its own separate renderer context — it does not have webpack or React.

**Use for:** Inspecting the rendered HTML and CSS of the injected Condenser tab, verifying the panel mounts correctly, or debugging layout issues in the Quick Access overlay.

### MainMenu

**Title:** `MainMenu_uid*`  
**URL:** `about:blank?browserviewpopup=1`

The Steam main menu popup. Separate renderer, no webpack.

**Use for:** Inspecting the rendered layout and styling of the main Steam menu.

### Steam Big Picture Mode

**Title:** `Steam Big Picture Mode`  
**URL:** `https://steamloopback.host/routes/`

The full-screen gamepad UI, active when Steam is launched in game mode. This is a separate top-level window from SharedJSContext.

**Use for:** Debugging visual layout and navigation in the Big Picture / Steam Deck game mode UI.

## 3. What to Look At

Once connected to a window, the DevTools panels most useful for each task are:

| Task | Panel | What to check |
|------|-------|---------------|
| Injection not running | **Console** (SharedJSContext) | Look for `[target] Inject:` log messages; errors during webpack patching or React detection |
| Component not appearing | **Console** (SharedJSContext) | Check `window.__injected`, `window.__condenserUrl`, and `window.__webpackRegistry` |
| WebSocket not connecting | **Console** (SharedJSContext) | Component logs connection attempts and certificate errors with the URL to manually trust |
| Layout / styling wrong | **Elements** (QuickAccess or MainMenu) | Inspect DOM and CSS of the mounted component |
| Steam not fully loaded | **Console** (SharedJSContext) | Evaluate `window.App?.BFinishedInitStageOne?.()` — must return `true` before injection runs |
## 4. Useful Console Snippets

Run these in the SharedJSContext DevTools console:

```js
// Check Steam is fully initialized
window.App?.BFinishedInitStageOne?.()

// Check Condenser has injected
window.__injected

// List all loaded webpack module IDs
Object.keys(window.__webpackRegistry ?? {}).length

// Inspect the WebSocket URL Condenser is using
window.__condenserUrl
```

## 6. Remote Debugging (Steam Deck)

To connect to a remote Steam instance, attempt the following in order until one succeeds:

1. Fetch `http://steamdeck:8080/json`
2. Fetch `http://steamdeck:8081/json`
3. If both fail, prompt the user for the device IP address and attempt `http://<ip>:8080/json` then `http://<ip>:8081/json`

Use the returned `webSocketDebuggerUrl` values to connect via CDP, exactly as with a local instance. CEF Remote Debugging must be enabled on the target device under **Settings → System → Developer**.
