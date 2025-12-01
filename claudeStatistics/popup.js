const orgInput = document.getElementById("orgId");
const output = document.getElementById("data");
const refreshBtn = document.getElementById("refresh");

let intervalId = null;

async function fetchUsage(orgId) {
    try {
        const url = `https://claude.ai/api/organizations/${orgId}/usage`;

        const resp = await fetch(url, {
            credentials: "include"
        });

        if (!resp.ok) {
            return { error: `HTTP ${resp.status}: ${await resp.text()}` };
        }

        return await resp.json();

    } catch (e) {
        return { error: e.toString() };
    }
}

function render(data) {
    output.textContent = JSON.stringify(data, null, 2);
}

async function refresh() {
    const orgId = orgInput.value.trim();
    if (!orgId) {
        render({ error: "No organization ID set" });
        return;
    }

    render({ loading: true });

    const data = await fetchUsage(orgId);
    render(data);
}

function startAutoRefresh() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(refresh, 60 * 1000); // 60 seconds
}

orgInput.addEventListener("input", () => {
    const orgId = orgInput.value.trim();
    chrome.storage.local.set({ orgId });
});

refreshBtn.addEventListener("click", refresh);

// Initial load
chrome.storage.local.get(["orgId"], (result) => {
    if (result.orgId) {
        orgInput.value = result.orgId;
    }
    refresh();
    startAutoRefresh();
});
