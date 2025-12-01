//
// Claude Usage Inject (with working toggle)
//

async function waitForComposer(timeout = 15000) {
    return new Promise(resolve => {
        const deadline = Date.now() + timeout;

        function check() {
            const composer = document.querySelector('[data-testid="chat-input"]');
            if (composer) resolve(composer);
            else if (Date.now() > deadline) resolve(null);
            else requestAnimationFrame(check);
        }
        check();
    });
}

async function fetchUsage(orgId) {
    try {
        const resp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
            credentials: "include"
        });
        if (!resp.ok) return { error: `HTTP ${resp.status}` };
        return resp.json();
    } catch (e) {
        return { error: e.toString() };
    }
}

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

function createProgressBar(percent) {
    const outer = document.createElement("div");
    outer.className = "usage-bar-outer";

    const inner = document.createElement("div");
    inner.className = "usage-bar-inner";
    inner.style.width = `${percent}%`;

    if (percent >= 90) inner.classList.add("high");
    outer.appendChild(inner);
    return outer;
}

function createUsagePanel() {
    const box = document.createElement("div");
    box.id = "claude-usage-panel";
    box.textContent = "Loading…";
    return box;
}

function buildUsageBlock(title, utilization, resetTime) {
    const block = document.createElement("div");
    block.className = "usage-block";

    const line = document.createElement("div");
    line.className = "usage-line";

    const titleSpan = document.createElement("span");
    titleSpan.className = "usage-title";
    titleSpan.textContent = `${title}: ${utilization}%`;

    const resetSpan = document.createElement("span");
    resetSpan.className = "usage-reset";
    resetSpan.textContent = `reset in ${resetTime}`;

    line.appendChild(titleSpan);
    line.appendChild(resetSpan);

    block.appendChild(line);
    block.appendChild(createProgressBar(utilization));

    return block;
}

function formatPanel(panel, data) {
    if (!data || data.error) {
        panel.textContent = data?.error ?? "No data";
        return;
    }

    panel.innerHTML = "";

    const row = document.createElement("div");
    row.className = "usage-row";

    row.appendChild(
        buildUsageBlock(
            "5h",
            data.five_hour?.utilization ?? 0,
            fmtResetTime(data.five_hour?.resets_at)
        )
    );

    row.appendChild(
        buildUsageBlock(
            "7d",
            data.seven_day?.utilization ?? 0,
            fmtResetTime(data.seven_day?.resets_at)
        )
    );

    panel.appendChild(row);
}

async function mountPanel() {
    const existing = document.getElementById("claude-usage-panel");
    if (existing) return;

    const composer = await waitForComposer();
    if (!composer) return;

    const buttonRow = composer.closest(".flex").parentElement;
    if (!buttonRow) return;

    const panel = createUsagePanel();
    buttonRow.appendChild(panel);

    chrome.storage.local.get(["orgId"], ({ orgId }) => {
        if (!orgId) {
            panel.textContent = "Set org ID in popup.";
            return;
        }

        async function update() {
            const data = await fetchUsage(orgId);
            formatPanel(panel, data);
        }

        update();
        setInterval(update, 60 * 1000);
    });
}

async function init() {
    // Mount initially if toggled on
    chrome.storage.local.get(["showUsage"], ({ showUsage }) => {
        if (showUsage !== false) mountPanel();
    });

    // React to toggle changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.showUsage) {
            const enabled = changes.showUsage.newValue;
            const panel = document.getElementById("claude-usage-panel");

            if (enabled) {
                if (!panel) mountPanel();
            } else {
                if (panel) panel.remove();
            }
        }
    });

    // Patch against Claude rerendering UI
    const observer = new MutationObserver(() => {
        chrome.storage.local.get(["showUsage"], ({ showUsage }) => {
            const exists = document.getElementById("claude-usage-panel");

            if (showUsage === false) {
                if (exists) exists.remove();
            } else {
                if (!exists) mountPanel();
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

init();
