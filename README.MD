# Claude Usage Monitor

Displays your Claude AI usage limits directly where you work. Two flavors in this repo:

- [`claudeStatistics`](claudeStatistics/) — Chrome extension, shows usage bars on claude.ai
- [`claudeStatisticsVSCode`](claudeStatisticsVSCode/) — VS Code extension, shows usage in the status bar

## Preview

![In-page Usage Display](preview_chat.png)

![Extension Popup](preview_popup.png)

## Chrome Extension

### Features

- In-page usage display with 5-hour and 7-day limits
- Color-coded progress bars (blue → red at 90%)
- Customizable refresh rate
- Quick access popup with usage stats
- Clickable header to open new Claude chat

### Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `claudeStatistics` folder

### Setup

1. Click the extension icon
2. Enter your Claude Organization ID
3. (Optional) Adjust refresh rate in seconds

### Finding Your Organization ID

1. Go to [claude.ai](https://claude.ai)
2. Open Developer Tools (F12)
3. Go to Network tab
4. Send a message
5. Look for `/api/organizations/` request
6. Copy the org ID (format: `org_xxxxxxxxxxxxxxxxxxxxx`)

### Privacy

- Organization ID stored locally only
- No external data sharing
- Direct API calls to claude.ai

## VS Code Extension

Shows `5h 42% · 7d 15%` in the status bar, with reset times on hover. Runs your real Chrome in a separate, isolated profile that you log into once — no cookies or headers to copy, since claude.ai's Cloudflare/session protections only trust an actual logged-in browser.

### Installation

1. Clone this repository
2. In `claudeStatisticsVSCode`, run `npm install` then `npx playwright install chromium` (one-time, downloads a Chromium build)
3. Open the `claudeStatisticsVSCode` folder in VS Code
4. Press `F5` to run it in an Extension Development Host

   (To install permanently: `npm install -g @vscode/vsce`, run `vsce package` in `claudeStatisticsVSCode`, then install the generated `.vsix` from the Extensions view → `...` → "Install from VSIX...")

### Setup

1. Click the status bar item ("Claude Usage: click to log in")
2. Log in to claude.ai in the Chrome window that opens — it minimizes itself and keeps running as a background process once you land on the chat screen (only needed once: it survives VS Code restarts and is shared across all your VS Code windows)
3. Usage refreshes automatically; click the status bar item any time to refresh, log out, or reconfigure

See [`claudeStatisticsVSCode/README.md`](claudeStatisticsVSCode/README.md) for details.

## License

Provided as-is for personal use.

## Disclaimer

Unofficial extension, not affiliated with Anthropic or Claude AI.