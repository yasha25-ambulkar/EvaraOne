require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { db } = require("../src/config/firebase.js");
const { getNodeDetails } = require("../src/services/deviceLookupService");

async function run() {
  console.log("Checking EV-TDS-001 via getNodeDetails...");
  
  try {
    const enriched = await getNodeDetails("EV-TDS-001");
    console.log("ENRICHED DEVICE:", JSON.stringify(enriched, null, 2));
    
    if (enriched) {
        const { getTDSDeviceState, getTDSHistory } = require('../src/services/tdsStateService');
        console.log("Fetching state...");
        const state = await getTDSDeviceState(enriched);
        console.log("FINAL STATE:", JSON.stringify(state, null, 2));

        console.log("Fetching history...");
        const history = await getTDSHistory(enriched, 10);
        console.log("HISTORY:", JSON.stringify(history, null, 2));
    }
  } catch (err) {
      console.error("getNodeDetails failed:", err);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
