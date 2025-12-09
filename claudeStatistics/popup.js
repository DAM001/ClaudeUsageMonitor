const orgInput = document.getElementById("orgId");
const refreshRateInput = document.getElementById("refreshRate");
const toggleUsage = document.getElementById("toggleUsage");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");

// Popup usage elements
const bar5h = document.getElementById("popup-5h-bar");
const reset5h = document.getElementById("popup-5h-reset");

const bar7d = document.getElementById("popup-7d-bar");
const reset7d = document.getElementById("popup-7d-reset");

// Load settings
chrome.storage.local.get(["orgId", "showUsage", "refreshRate"], (res) => {
    if (res.orgId) orgInput.value = res.orgId;
    toggleUsage.checked = res.showUsage ?? true;
    if (res.refreshRate) refreshRateInput.value = res.refreshRate;
});

// Save instantly
orgInput.addEventListener("input", () => {
    chrome.storage.local.set({ orgId: orgInput.value.trim() });
});

refreshRateInput.addEventListener("input", () => {
    const rate = parseInt(refreshRateInput.value) || 60;
    chrome.storage.local.set({ refreshRate: rate });
});

toggleUsage.addEventListener("change", () => {
    chrome.storage.local.set({ showUsage: toggleUsage.checked });
});

async function fetchUsage(orgId) {
    try {
        const resp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
            credentials: "include"
        });

        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

function fmtReset(dateStr) {
    if (!dateStr) return "--";
    const t = new Date(dateStr);
    const diff = t - new Date();
    if (diff <= 0) return "soon";

    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const mm = m % 60;

    if (h > 0) return `${h}h ${mm}m`;
    return `${mm}m`;
}

async function refresh() {
    const orgId = orgInput.value.trim();
    if (!orgId) return;

    const data = await fetchUsage(orgId);
    if (!data) return;

    // Reset bars to 0 first for smooth animation
    bar5h.style.width = "0%";
    bar7d.style.width = "0%";
    bar5h.classList.remove("high");
    bar7d.classList.remove("high");

    // Force a layout reflow so animations restart properly
    void bar5h.offsetWidth;

    // Now animate to actual values
    const util5 = data.five_hour?.utilization ?? 0;
    bar5h.style.width = util5 + "%";
    bar5h.classList.toggle("high", util5 >= 90);
    reset5h.textContent = "reset in " + fmtReset(data.five_hour?.resets_at);

    const util7 = data.seven_day?.utilization ?? 0;
    bar7d.style.width = util7 + "%";
    bar7d.classList.toggle("high", util7 >= 90);
    reset7d.textContent = "reset in " + fmtReset(data.seven_day?.resets_at);

    // Timestamp
    const now = new Date();
    lastUpdated.textContent =
        "Updated: " +
        now.getHours().toString().padStart(2, "0") + ":" +
        now.getMinutes().toString().padStart(2, "0");
}

refreshBtn.addEventListener("click", refresh);

// Auto-refresh when the popup becomes visible
document.addEventListener("DOMContentLoaded", () => {
    refresh();
});