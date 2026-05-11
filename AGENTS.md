# Debugging the Steam App

This guide explains how to connect to the running Steam app for debugging using Chrome DevTools and the Condenser debug CLI.

## Prerequisites

Steam must have been launched in debug mode via:

```bash
npm run app  # Game mode (Big Picture / Steam Deck UI)
```

This starts Steam with the `-cef-enable-debugging` flag, which exposes a Chrome DevTools Protocol (CDP) endpoint on `http://localhost:8080`.

Assume the app is already running and probe for ports, if not running prompt the user to run the app in debug mode.

---

## Debug CLI (`scripts/debug.ts`)

The fastest way to diagnose issues is the built-in debug CLI. It connects to Steam via CDP automatically — no browser needed.

```bash
npm run debug <command> [options]
# or directly:
tsx scripts/debug.ts <command> [options]
```

### Commands

| Command | What it does |
|---------|-------------|
| `status` | Check if Steam is running and Condenser is booted |
| `targets` | List all active CDP debug targets (title, URL, WS URL) |
| `eval <expr>` | Evaluate a JS expression in SharedJSContext |
| `errors` | Print captured `console.error` calls |
| `condenser` | Full Condenser runtime state dump |
| `react` | React version and fiber tree statistics |
| `render <pluginId>` | Test-render a plugin panel in isolation, surface React errors |
| `styles <selector>` | Computed styles and layout rect for a CSS selector |
| `webpack <pattern>` | Search all webpack module sources for a string pattern |

**Options:**
- `--target <title>` — Connect to a specific CDP target by title fragment (e.g. `--target QuickAccess`). Defaults to SharedJSContext.

### Examples

```bash
# Is everything running?
npm run debug status

# What are the available CDP windows?
npm run debug targets

# Check a JS value in Steam
npm run debug eval "window.__condenser?.core?.React?.version"

# See what errors have been thrown
npm run debug errors

# Full Condenser state
npm run debug condenser

# Test-render a plugin and catch React errors
npm run debug render condenser-tab

# Inspect the Quick Access Menu's CSS
npm run debug styles ".QAM_Panel" --target QuickAccess

# Find the webpack module that handles QAM tabs
npm run debug webpack "QuickAccessMenuBrowserView"

# Search for a React component by display name
npm run debug webpack "CondenserTab"
```

---

## Debugging by Issue Type

### JavaScript errors

**Symptoms:** Condenser not booting, plugin not loading, WebSocket not connecting.

**Start with:**
```bash
npm run debug status      # Is condenser booted?
npm run debug errors      # Any console.error calls?
npm run debug condenser   # Full state dump
```

**Manual DevTools:** Open SharedJSContext in Chrome DevTools (see below). Use the **Console** panel and look for `[condenser]` log prefixes. Key globals to inspect:

```js
window.__condenser?.core           // Booted, React, WS URL, CSRF token
window.__condenser?.components     // Loaded plugins
window.webpackChunksteamui         // Steam's webpack chunk array (must exist)
```

**Common causes:**
- `booted: false` — boot.ts never ran. Check that the backend is running and the CDP injection succeeded in `backend/target.ts`.
- `React not found` — `discoverSteamContext` failed. Use `npm run debug webpack "useLayoutEffect"` to check if React is in the webpack registry.
- `csrfToken: (not set)` — The `/auth/token` fetch failed. Check the backend is running on port 3001.
- `WebSocket error` — TLS certificate not trusted. Open the backend HTTP URL in a browser tab to accept the certificate.

---

### React errors

**Symptoms:** Plugin panel not appearing, React error thrown during QAM render, `Minified React error #NNN`.

**Start with:**
```bash
npm run debug render condenser-tab   # Renders the panel in isolation and surfaces errors
npm run debug react                  # React version and fiber stats
npm run debug condenser              # Check patched, patchedTypeCache, hasForceUpdate
```

**Decoding minified React errors:**

React 19 formats errors as `https://react.dev/errors/<N>`. If the URL 404s (new error code), use the webpack search to find the error number in Steam's bundle:

```bash
npm run debug webpack "react.dev/errors"
# Then load the module and call the formatter with the error number
npm run debug eval "(() => { let wr; window.webpackChunksteamui.push([[Symbol()],{},(r)=>{wr=r}]); const m=wr(65473); return Object.values(m).find(v=>typeof v==='function')?.toString().slice(0,300); })()"
```

**Common causes:**
- `Cannot read properties of null (reading 'useState')` — A hook is calling into a React instance with a null dispatcher, meaning it is NOT using Steam's React. Check that `react` and `react/jsx-runtime` are in `optimizeDeps.exclude` in [frontend/vite.config.ts](frontend/vite.config.ts) so Vite's pre-bundler doesn't shadow the virtual module shim.
- `Minified React error #321` — React component called outside React's render cycle (e.g. called directly as a function in a script instead of via `createElement`). Never call component functions directly.
- `hasForceUpdate: false` after plugin loads — `InjectedTabPanel` never mounted, meaning the QAM tab panel was not rendered. Open the Quick Access Menu to trigger a first render.
- Hook order violation — Hooks must be called the same number of times every render. Avoid conditional hook calls.

**Checking which React instance is used:**

```bash
# The virtual module must resolve 'react' to Steam's React (window.__condenser.core.React)
# If this shows a localhost URL, the pre-bundler is shadowing the virtual module:
npm run debug eval "window.__condenser?.core?.React?.version"
```

The output should match the version returned by `npm run debug react`.

---

### Styling issues

**Symptoms:** Injected tab appears but looks wrong — wrong colours, broken layout, invisible text.

**Start with:**
```bash
# Inspect computed styles on the injected panel container in the QAM window
npm run debug styles ".Panel" --target QuickAccess

# Or inspect the tab icon in the navigation bar
npm run debug styles "[data-condenser-tab]" --target QuickAccess

# Find Steam's CSS class names for a component
npm run debug webpack "DialogButton"
```

**Manual DevTools:** Connect to the **QuickAccess** target (not SharedJSContext — it's a separate renderer). Use **Elements** to inspect the mounted Condenser tab DOM. Use **Computed** styles to see which CSS rules apply.

**Common causes:**
- Steam's UI uses obfuscated class names (e.g. `_1zGXSZJ-SkOi-pxNGiYxU`). Use `npm run debug webpack` to find the CSS module that defines the class, then copy it into your component.
- Colours look wrong in dark/light mode — Steam uses CSS custom properties (`--`) that change per theme. Find them with `npm run debug styles body` and look at the `cssVars` field in the output.
- Panel content clipped — check `overflow` in computed styles; the QAM panel scrolls vertically.

---

## CDP Targets Reference

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

---

## Manual DevTools Connection

### 1. List targets

```bash
curl http://localhost:8080/json/list
```

Each entry has a `webSocketDebuggerUrl` — open it in Chrome via:

```
chrome://inspect → Configure → localhost:8080 → Inspect
```

Or use the `devtoolsFrontendUrl` path served from the Steam process itself.

### 2. Useful Console Snippets

Run these in the SharedJSContext DevTools console:

```js
// Full Condenser state
JSON.stringify(window.__condenser?.core, null, 2)

// List loaded plugins
Object.keys(window.__condenser?.components ?? {})

// Force a plugin panel re-render
window.__condenser?.components?.['condenser-tab']?.forceUpdate?.()

// Check Steam is fully initialized
window.App?.BFinishedInitStageOne?.()

// How many webpack modules are loaded?
Object.keys(window.webpackChunksteamui?.[0]?.[1] ?? {}).length

// Find a webpack module by source pattern (e.g. find where QuickAccessMenu is defined)
(() => {
  let wr;
  window.webpackChunksteamui.push([[Symbol()], {}, r => { wr = r; }]);
  return Object.entries(wr.m)
    .filter(([, fn]) => fn.toString().includes('QuickAccessMenu'))
    .map(([id]) => id);
})()
```

---

## Remote Debugging (Steam Deck)

To connect to a remote Steam instance, attempt the following in order until one succeeds:

1. Fetch `http://steamdeck:8080/json`
2. Fetch `http://steamdeck:8081/json`
3. If both fail, prompt the user for the device IP address and attempt `http://<ip>:8080/json` then `http://<ip>:8081/json`

Use the returned `webSocketDebuggerUrl` values to connect via CDP, exactly as with a local instance. CEF Remote Debugging must be enabled on the target device under **Settings → System → Developer**.

The `--target` flag in the debug CLI uses the local `localhost:8080` endpoint by default. For Steam Deck, update `DEBUG_PORTS` in [scripts/debug.ts](scripts/debug.ts) or use the raw `tsx scripts/debug.ts eval` with a manually specified connection.
