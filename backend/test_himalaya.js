const axios = require('axios');

require('dotenv').config();

// HIMALAYA Channel Info (from previous logs/context)
const channelId = process.env.THINGSPEAK_CHANNEL_ID_HIMALAYA || '3275001';
const apiKey = process.env.THINGSPEAK_API_KEY_HIMALAYA;

if (!apiKey) {
    console.error("Error: THINGSPEAK_API_KEY_HIMALAYA not defined in .env");
    process.exit(1);
}

async function audit() {
    console.log(`Auditing Channel: ${channelId}...`);
    try {
        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
        const response = await axios.get(url);
        const feeds = response.data.feeds || [];
        
        if (feeds.length === 0) {
            console.log("No feeds found for this channel.");
            return;
        }

        const latest = feeds[0];
        console.log("\n--- LATEST FEED DATA ---");
        console.log(`Timestamp: ${latest.created_at}`);
        
        for (let i = 1; i <= 8; i++) {
            const field = `field${i}`;
            const val = latest[field];
            console.log(`${field}: ${val} ${val !== null && val !== undefined ? '(DATA FOUND)' : '(empty)'}`);
        }

        console.log("\n--- SUGGESTED MAPPING ---");
        let suggestedTotal = null;
        let suggestedFlow = null;

        for (let i = 1; i <= 8; i++) {
            const val = parseFloat(latest[`field${i}`]);
            if (!isNaN(val) && val > 100) suggestedTotal = `field${i}`;
            if (!isNaN(val) && val > 0 && val < 500 && !suggestedFlow) suggestedFlow = `field${i}`;
        }

        console.log(`Suggested Total Liters Field: ${suggestedTotal || 'Not found'}`);
        console.log(`Suggested Flow Rate Field: ${suggestedFlow || 'Not found'}`);

    } catch (err) {
        console.error("Audit failed:", err.message);
    }
}

audit();
