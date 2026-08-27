# Claude Usage Monitor (VS Code)

Shows your Claude AI 5-hour and 7-day usage limits in the VS Code status bar.

Runs your real Chrome (or Edge) browser in a separate, isolated profile. You log in to claude.ai in it once, then it hides itself and stays open in the background, so the extension can keep reading your usage through that same live, logged-in session — the same way the Chrome extension reads it from your regular browser tab.

## Install (run from source)

1. Open this folder (`claudeStatisticsVSCode`) in a terminal and run:
   ```
   npm install
   npx playwright install chromium
   ```
   (one-time only — downloads a Chromium build, a few hundred MB)
2. Open the folder in VS Code and press `F5` to launch an Extension Development Host with it loaded.

   (To install permanently instead: `npm install -g @vscode/vsce` then run `vsce package` in this folder and install the generated `.vsix` via the Extensions view "Install from VSIX...".)

## Setup

1. Click the status bar item (bottom right, "Claude Usage: click to log in").
2. A Chrome window opens on the claude.ai login page — log in as normal.
3. Once you land on the chat screen, the window hides itself automatically and usage starts showing in the status bar.

That's the only time you'll see this. The browser runs as its own background process (detached from VS Code), so:
- Closing/reloading VS Code, or restarting your machine, doesn't need a re-login — the browser process keeps running in the background regardless, and even if it does eventually get closed, your claude.ai session is saved to disk in its profile and comes back automatically.
- Every VS Code window on your machine shares the same login — open a second window and it reconnects to the same background browser instead of asking you to log in again.

No org ID, cookies, or headers to find or copy — the extension looks up your organization and reads usage through the logged-in browser session itself.

Click the status bar item any time for **Refresh Now**, **Log Out**, or settings.

## Why a whole browser instead of a simple HTTP request?

claude.ai sits behind Cloudflare and its own session checks, both of which are built to recognize (and block) plain scripted requests — even valid-looking cookies get rejected, and even automated *browsers* get flagged if they look automated (e.g. Playwright's default launch sets `navigator.webdriver = true`, and headless mode has its own tells). So this extension spawns your actual installed Chrome directly — no automation flags, no headless mode — and just keeps that one real, already-logged-in window running in the background (hidden) instead of relaunching a fresh instance per refresh.

## Privacy

- The browser profile (holding your claude.ai login) is stored locally in this extension's own VS Code storage folder, isolated from your regular browser, never synced or sent anywhere except directly to `claude.ai`.
- **Log Out** closes the background browser and deletes that profile entirely, everywhere.

## Disclaimer

Unofficial extension, not affiliated with Anthropic or Claude AI.
