const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const LOGGED_IN_KEY = "claudeUsageMonitor.loggedIn";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SYSTEM_BROWSER_PATHS = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

// A hidden window looks occluded/backgrounded to Chromium, which would throttle its
// timers and stall the periodic fetch in fetchUsage(). These keep it running normally.
const BACKGROUND_ARGS = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion"
];

const OFFSCREEN_ARG = "--window-position=-32000,-32000";

let statusBarItem;
let refreshTimer;
let browser = null;
let browserProcess = null;
let usagePage = null;
let launching = null;

function fmtResetTime(dateStr) {
    if (!dateStr) return "soon";

    const target = new Date(dateStr);
    const diff = target - new Date();
    if (diff <= 0) return "soon";

    const mins = Math.floor(diff / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

function renderBar(percent, width = 12) {
    const clamped = Math.min(Math.max(percent, 0), 100);
    const eighths = Math.round((clamped / 100) * width * 8);
    const fullBlocks = Math.min(Math.floor(eighths / 8), width);
    const remainder = eighths - fullBlocks * 8;
    const hasPartial = fullBlocks < width && remainder > 0;
    const emptyCount = width - fullBlocks - (hasPartial ? 1 : 0);

    const bar = "█".repeat(fullBlocks) +
        (hasPartial ? EIGHTHS[remainder] : "") +
        "░".repeat(emptyCount);

    return `[${bar}]`;
}

function profileDir(context) {
    return path.join(context.globalStorageUri.fsPath, "browser-profile");
}

function connectionFile(context) {
    return path.join(context.globalStorageUri.fsPath, "connection.json");
}

async function readConnectionInfo(context) {
    try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(connectionFile(context)));
        return JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
        return null;
    }
}

async function writeConnectionInfo(context, info) {
    await vscode.workspace.fs.writeFile(
        vscode.Uri.file(connectionFile(context)),
        Buffer.from(JSON.stringify(info), "utf8")
    );
}

async function deleteConnectionInfo(context) {
    await vscode.workspace.fs.delete(vscode.Uri.file(connectionFile(context)))
        .then(() => {}, () => {});
}

function findBrowserExecutable() {
    for (const p of SYSTEM_BROWSER_PATHS) {
        if (p && fs.existsSync(p)) return p;
    }
    return chromium.executablePath();
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

function waitForCdp(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve, reject) => {
        function attempt() {
            const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
                res.resume();
                if (res.statusCode === 200) resolve();
                else retry();
            });
            req.on("error", retry);
            req.setTimeout(500, () => req.destroy());
        }

        function retry() {
            if (Date.now() > deadline) {
                reject(new Error("Browser debug port did not become ready in time"));
                return;
            }
            setTimeout(attempt, 300);
        }

        attempt();
    });
}

async function disconnectOnly() {
    // Drop our handle without killing a process another VS Code window may still be using.
    browser = null;
    usagePage = null;
    browserProcess = null;
}

async function closeAll(context) {
    const info = await readConnectionInfo(context);

    if (browser) {
        await browser.close().catch(() => {});
    }
    browser = null;
    usagePage = null;

    if (browserProcess) {
        browserProcess.kill();
        browserProcess = null;
    } else if (info?.pid) {
        try {
            process.kill(info.pid);
        } catch {
            // already gone
        }
    }

    await deleteConnectionInfo(context);
}

async function tryReconnect(context) {
    const info = await readConnectionInfo(context);
    if (!info) return null;

    try {
        const b = await chromium.connectOverCDP(`http://127.0.0.1:${info.port}`);
        browser = b;
        browserProcess = null; // owned by whichever window originally spawned it

        // A browser from an older version, or one another window launched, may still be
        // on screen. Skipped while logged out so an in-progress login stays visible.
        if (context.globalState.get(LOGGED_IN_KEY, false)) hideProcessWindows(info.pid);
        return b;
    } catch {
        return null;
    }
}

async function launchBrowser(context, { visible = false } = {}) {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const port = await getFreePort();

    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir(context)}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        ...BACKGROUND_ARGS
    ];

    // Placed off-screen from the first frame so no window flashes into view before
    // hideProcessWindows() below gets to it. Login is the one case we want visible.
    if (!visible) args.push(OFFSCREEN_ARG);

    // Detached + unref'd so this browser survives VS Code restarts/reloads —
    // other windows (and future sessions) reconnect to it via connection.json
    // instead of spawning their own and re-prompting for login.
    browserProcess = spawn(findBrowserExecutable(), args, { stdio: "ignore", detached: true });
    browserProcess.unref();
    const pid = browserProcess.pid;
    if (!visible) hideProcessWindows(pid);

    browserProcess.on("exit", () => {
        browserProcess = null;
        browser = null;
        usagePage = null;
    });

    await waitForCdp(port, 20000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    await writeConnectionInfo(context, { port, pid });
    return browser;
}

async function ensureBrowser(context, opts) {
    if (browser && browser.isConnected()) return browser;
    if (launching) return launching;

    launching = (async () => {
        const reused = await tryReconnect(context);
        if (reused) return reused;
        return launchBrowser(context, opts);
    })();

    try {
        return await launching;
    } finally {
        launching = null;
    }
}

async function minimizeWindow(page) {
    try {
        const session = await page.context().newCDPSession(page);
        const { windowId } = await session.send("Browser.getWindowForTarget");
        await session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
    } catch {
        // best effort — not fatal if the platform/version doesn't support it
    }
}

// SW_HIDE on the browser's own window: it leaves the taskbar and Alt-Tab entirely,
// unlike a minimize. .NET's MainWindowHandle only reports *visible* top-level windows,
// so re-reading it in a loop hides each window Chromium puts up during startup.
function hideProcessWindows(pid) {
    if (process.platform !== "win32" || !pid) return;

    const script = [
        "$ErrorActionPreference = 'SilentlyContinue'",
        "Add-Type -Namespace Win -Name Api -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'",
        `$p = Get-Process -Id ${pid}`,
        'if (-not $p) { exit }',
        'for ($i = 0; $i -lt 40; $i++) {',
        '  if ($p.HasExited) { break }',
        '  $p.Refresh()',
        '  $h = $p.MainWindowHandle',
        '  if ($h -ne [IntPtr]::Zero) { [Win.Api]::ShowWindow($h, 0) | Out-Null }',
        '  Start-Sleep -Milliseconds 250',
        '}'
    ].join("\n");

    // -EncodedCommand sidesteps the quoting mess of passing this through argv.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    // Deliberately NOT detached: a detached powershell.exe silently never executes here,
    // and this helper only lives ~10s anyway. windowsHide keeps its console from flashing.
    const ps = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { stdio: "ignore", windowsHide: true }
    );
    ps.on("error", () => {});
    ps.unref();
}

async function hideWindow(context, page) {
    // Elsewhere there's no ShowWindow equivalent to reach for, so minimizing is the best available.
    if (process.platform !== "win32") {
        await minimizeWindow(page);
        return;
    }

    try {
        const session = await page.context().newCDPSession(page);
        const { windowId } = await session.send("Browser.getWindowForTarget");
        await session.send("Browser.setWindowBounds", {
            windowId,
            bounds: { windowState: "normal", left: -32000, top: -32000, width: 1200, height: 900 }
        });
    } catch {
        // best effort — the ShowWindow pass below is what actually hides it
    }

    const info = await readConnectionInfo(context);
    hideProcessWindows(browserProcess?.pid || info?.pid);
}

async function login(context) {
    const b = await ensureBrowser(context, { visible: true });
    const ctx = b.contexts()[0] || (await b.newContext());
    const page = await ctx.newPage();
    await page.goto("https://claude.ai/login", { waitUntil: "domcontentloaded" });

    vscode.window.showInformationMessage(
        "Log in to claude.ai in the window that just opened. This only needs to happen once."
    );

    try {
        await page.waitForSelector('[data-testid="chat-input"]', { timeout: LOGIN_TIMEOUT_MS });
    } catch {
        vscode.window.showWarningMessage("Login not detected within 5 minutes — try again.");
        return;
    }

    await context.globalState.update(LOGGED_IN_KEY, true);
    usagePage = page;
    await hideWindow(context, page);

    vscode.window.showInformationMessage(
        "Logged in. The browser window hid itself — usage will now update in the status bar automatically."
    );

    await updateStatusBar(context);
}

async function logout(context) {
    await closeAll(context);
    await context.globalState.update(LOGGED_IN_KEY, false);
    await vscode.workspace.fs.delete(vscode.Uri.file(profileDir(context)), { recursive: true, useTrash: false })
        .then(() => {}, () => {});
    await updateStatusBar(context);
}

async function fetchUsage(context) {
    const b = await ensureBrowser(context);
    const ctx = b.contexts()[0] || (await b.newContext());

    if (!usagePage || usagePage.isClosed()) {
        usagePage = ctx.pages().find(p => !p.isClosed() && p.url().startsWith("https://claude.ai")) || null;

        if (!usagePage) {
            usagePage = await ctx.newPage();
            await usagePage.goto("https://claude.ai/", { waitUntil: "domcontentloaded" });
            await hideWindow(context, usagePage);
        }
    }

    return usagePage.evaluate(async () => {
        const orgsResp = await fetch("/api/organizations", { credentials: "include" });
        if (!orgsResp.ok) throw new Error(`organizations HTTP ${orgsResp.status}`);
        const orgs = await orgsResp.json();
        const orgId = orgs?.[0]?.uuid;
        if (!orgId) throw new Error("no organization found for this account");

        const usageResp = await fetch(`/api/organizations/${orgId}/usage`, { credentials: "include" });
        if (!usageResp.ok) throw new Error(`usage HTTP ${usageResp.status}`);
        return usageResp.json();
    });
}

async function updateStatusBar(context) {
    const loggedIn = context.globalState.get(LOGGED_IN_KEY, false);

    if (!loggedIn) {
        statusBarItem.text = "$(pulse) Claude Usage: click to log in";
        statusBarItem.tooltip = "Log in to claude.ai to see usage";
        statusBarItem.backgroundColor = undefined;
        statusBarItem.show();
        return;
    }

    try {
        const data = await fetchUsage(context);

        const util5 = data.five_hour?.utilization ?? 0;
        const util7 = data.seven_day?.utilization ?? 0;
        const reset5 = fmtResetTime(data.five_hour?.resets_at);
        const reset7 = fmtResetTime(data.seven_day?.resets_at);

        statusBarItem.text =
            `5h ${renderBar(util5)} ${util5}% (${reset5})  ·  7d ${renderBar(util7)} ${util7}% (${reset7})`;
        statusBarItem.tooltip = new vscode.MarkdownString(
            `**Claude Usage**\n\n5h: ${util5}% used, reset in ${reset5}\n\n7d: ${util7}% used, reset in ${reset7}`
        );
        statusBarItem.backgroundColor = (util5 >= 90 || util7 >= 90)
            ? new vscode.ThemeColor("statusBarItem.errorBackground")
            : undefined;
    } catch (e) {
        statusBarItem.text = "$(pulse) Claude Usage: error";
        statusBarItem.tooltip = `Failed to fetch usage: ${e.message}\n\nTry Log Out then Log In again.`;
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    }

    statusBarItem.show();
}

function scheduleRefresh(context) {
    if (refreshTimer) clearInterval(refreshTimer);

    const rate = vscode.workspace.getConfiguration("claudeUsageMonitor").get("refreshRate", 60);
    refreshTimer = setInterval(() => updateStatusBar(context), Math.max(rate, 5) * 1000);
}

async function showMenu(context) {
    const loggedIn = context.globalState.get(LOGGED_IN_KEY, false);

    const items = [
        { label: "$(refresh) Refresh Now", action: "refresh" },
        loggedIn
            ? { label: "$(sign-out) Log Out", action: "logout" }
            : { label: "$(sign-in) Log In", action: "login" },
        { label: "$(settings-gear) Open Settings", action: "settings" }
    ];

    const choice = await vscode.window.showQuickPick(items, { placeHolder: "Claude Usage Monitor" });
    if (!choice) return;

    if (choice.action === "refresh") await updateStatusBar(context);
    else if (choice.action === "login") await login(context);
    else if (choice.action === "logout") await logout(context);
    else if (choice.action === "settings") {
        await vscode.commands.executeCommand("workbench.action.openSettings", "claudeUsageMonitor");
    }
}

function activate(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "claudeUsageMonitor.menu";
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand("claudeUsageMonitor.menu", () => showMenu(context)),
        vscode.commands.registerCommand("claudeUsageMonitor.login", () => login(context)),
        vscode.commands.registerCommand("claudeUsageMonitor.logout", () => logout(context)),
        vscode.commands.registerCommand("claudeUsageMonitor.refresh", () => updateStatusBar(context))
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("claudeUsageMonitor.refreshRate")) {
                scheduleRefresh(context);
            }
        })
    );

    updateStatusBar(context);
    scheduleRefresh(context);
}

async function deactivate() {
    if (refreshTimer) clearInterval(refreshTimer);
    // Leave the shared background browser running (detached) so other VS Code
    // windows, and the next restart, can reconnect without logging in again.
    await disconnectOnly();
}

module.exports = { activate, deactivate };
