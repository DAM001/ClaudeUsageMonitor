const orgInput = document.getElementById("orgId");
const toggleUsage = document.getElementById("toggleUsage");
const refreshBtn = document.getElementById("refreshBtn");

// Load settings
chrome.storage.local.get(["orgId", "showUsage"], (res) => {
    if (res.orgId) orgInput.value = res.orgId;
    toggleUsage.checked = res.showUsage ?? true;
});

// Save org ID immediately on typing
orgInput.addEventListener("input", () => {
    chrome.storage.local.set({ orgId: orgInput.value.trim() });
});

// Save toggle state immediately
toggleUsage.addEventListener("change", () => {
    chrome.storage.local.set({ showUsage: toggleUsage.checked });
});

// Refresh icon click (test fetch)
refreshBtn.addEventListener("click", async () => {
    const orgId = orgInput.value.trim();
    if (!orgId) {
        console.log("No org ID set");
        return;
    }

    try {
        const resp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
            credentials: "include"
        });

        if (!resp.ok) {
            console.log("Error:", resp.status);
            return;
        }

        const data = await resp.json();
        console.log("Usage data:", data);

    } catch (e) {
        console.log("Fetch error:", e.toString());
    }
});
