# Claude Usage Monitor

A Chrome extension that displays your Claude AI usage limits directly in the Claude.ai interface and provides quick access to usage stats via a popup.

## Features

- **In-page Usage Display**: Shows your 5-hour and 7-day usage limits directly below the chat input on Claude.ai
- **Real-time Updates**: Automatically refreshes usage data every minute
- **Popup Dashboard**: Quick access to usage stats via the extension icon
- **Toggle Control**: Show or hide the in-page usage display with a simple toggle
- **Visual Indicators**: Color-coded progress bars (blue for normal, red for 90%+ usage)
- **Reset Timers**: See exactly when your usage limits will reset

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The Claude Usage Monitor icon should appear in your extensions toolbar

## Setup

1. Click the extension icon in your Chrome toolbar
2. Enter your Claude Organization ID in the "Organization ID" field
3. The extension will automatically save your settings and start monitoring usage

### Finding Your Organization ID

1. Go to [claude.ai](https://claude.ai)
2. Open your browser's Developer Tools (F12 or Right-click → Inspect)
3. Go to the Network tab
4. Refresh the page or send a message
5. Look for a request to `/api/organizations/` 
6. Your Organization ID will be in the URL (format: `org_xxxxxxxxxxxxxxxxxxxxx`)

## Usage

### In-page Display

Once configured, the usage monitor will appear below the chat input on Claude.ai:

- **5h**: Shows your 5-hour rolling usage limit
- **7d**: Shows your 7-day rolling usage limit
- Each display includes a progress bar and countdown timer until reset

### Popup Dashboard

Click the extension icon to view:

- Current usage percentages for both limits
- Time remaining until each limit resets
- Refresh button to manually update stats
- Toggle to show/hide the in-page display

## Project Structure

```
claude-usage-monitor/
├── manifest.json          # Extension configuration
├── popup.html            # Popup interface
├── popup.js              # Popup logic
├── popup.css             # Popup styling
├── toggle.css            # Toggle switch styling
├── inject.js             # Content script for Claude.ai
├── usage.css             # In-page usage display styling
└── assets/
    ├── icon.png          # Extension icon
    └── refresh.png       # Refresh button icon
```

## How It Works

1. **Content Script** (`inject.js`): Injects usage display into Claude.ai pages
2. **API Integration**: Fetches usage data from Claude's official API endpoint
3. **Local Storage**: Stores your Organization ID and preferences locally
4. **Popup Interface**: Provides quick access and control over the extension
5. **Auto-refresh**: Updates usage data every 60 seconds

## Permissions

- `storage`: To save your Organization ID and preferences
- `host_permissions` for `https://claude.ai/*`: To inject the usage display and fetch data

## Privacy

- Your Organization ID is stored locally in your browser
- No data is sent to external servers
- All API calls go directly to Claude.ai using your existing session

## Troubleshooting

**Usage not displaying:**
- Verify your Organization ID is correct
- Make sure you're logged into Claude.ai
- Check that the toggle is enabled in the popup
- Try refreshing the Claude.ai page

**"Set org ID in popup" message:**
- Click the extension icon and enter your Organization ID

**Data not updating:**
- Click the refresh button in the popup
- Check your internet connection
- Verify you're still logged into Claude.ai

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Claude Usage Monitor card
4. Reload Claude.ai to see changes

## Browser Compatibility

- Chrome (Manifest V3)
- Edge (Manifest V3)
- Other Chromium-based browsers supporting Manifest V3

## License

This project is provided as-is for personal use.

## Disclaimer

This is an unofficial extension and is not affiliated with or endorsed by Anthropic or Claude AI. Use at your own discretion.