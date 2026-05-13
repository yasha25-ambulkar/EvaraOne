
const DEVICE_STATUS = {
    ONLINE: "Online",
    OFFLINE: "Offline",
    OFFLINE_RECENT: "OfflineRecent"
};
const STATUS_THRESHOLD_MS = 30 * 60 * 1000;

function calculateStatus(createdAtStr) {
    const lastUpdated = new Date(createdAtStr);
    const now = Date.now();
    const timeSinceUpdate = now - lastUpdated.getTime();
    
    let status = DEVICE_STATUS.ONLINE;
    if (timeSinceUpdate > STATUS_THRESHOLD_MS) status = DEVICE_STATUS.OFFLINE;
    else if (timeSinceUpdate > STATUS_THRESHOLD_MS / 2) status = DEVICE_STATUS.OFFLINE_RECENT;
    
    return {
        now: new Date(now).toISOString(),
        lastUpdated: lastUpdated.toISOString(),
        timeSinceUpdateMs: timeSinceUpdate,
        status
    };
}

// User's case:
// ThingSpeak says 22:46:28 IST (17:16:28 UTC)
// Current time 22:48:45 IST (17:18:45 UTC)
console.log("Scenario 1 (2 mins gap):", calculateStatus("2026-05-13T17:16:28Z"));

// What if ThingSpeak returns a date WITHOUT 'Z'?
console.log("Scenario 2 (No Z, treated as local):", calculateStatus("2026-05-13T17:16:28"));

// What if the server time is ahead?
// If server is 20 mins ahead of UTC...
const fakeNow = new Date("2026-05-13T17:36:28Z").getTime();
const lastUpdated = new Date("2026-05-13T17:16:28Z").getTime();
console.log("Scenario 3 (20 mins gap):", {
    timeSinceUpdateMs: fakeNow - lastUpdated,
    isOfflineRecent: (fakeNow - lastUpdated) > (STATUS_THRESHOLD_MS / 2)
});
