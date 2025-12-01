//
// Claude Usage Inject Script (Improved layout + reset times)
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
        const resp = await fetch(
            `https://claude.ai/api/organizations/${orgId}/usage`,
            { credentials: "include" }
        );

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
    if (!data) {
        panel.textContent = "No data";
        return;
    }
    if (data.error) {
        panel.textContent = "Error: " + data.error;
        return;
    }

    panel.innerHTML = "";

    const row = document.createElement("div");
    row.className = "usage-row";

    const fiveUtil = data.five_hour?.utilization ?? 0;
    const fiveReset = fmtResetTime(data.five_hour?.resets_at);

    const sevenUtil = data.seven_day?.utilization ?? 0;
    const sevenReset = fmtResetTime(data.seven_day?.resets_at);

    row.appendChild(buildUsageBlock("5h", fiveUtil, fiveReset));
    row.appendChild(buildUsageBlock("7d", sevenUtil, sevenReset));

    panel.appendChild(row);
}

async function mountPanel() {
    const composer = await waitForComposer();
    if (!composer) return;

    const buttonRow = composer.closest(".flex").parentElement;
    if (!buttonRow) return;

    if (document.getElementById("claude-usage-panel")) return;

    const panel = createUsagePanel();
    buttonRow.appendChild(panel);

    chrome.storage.local.get(["orgId"], ({ orgId }) => {
        if (!orgId) {
            panel.textContent = "Set org ID in extension popup.";
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
    await mountPanel();

    const observer = new MutationObserver(() => {
        if (!document.getElementById("claude-usage-panel")) {
            mountPanel();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

init();
