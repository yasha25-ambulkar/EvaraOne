require('dotenv').config();
const { getDeviceState } = require('../src/services/deviceStateService');
const { getNodeDetails } = require('../src/services/deviceLookupService');

async function testAnalytics() {
    const id = "EV-TNK-003";
    console.log(`Testing analytics for ${id}...`);
    const device = await getNodeDetails(id);
    const state = await getDeviceState(device);
    
    console.log(`Online: ${state.online}`);
    console.log(`History length: ${state.history?.length}`);
    if (state.history?.length > 0) {
        console.log(`Latest: ${JSON.stringify(state.history[state.history.length-1], null, 2)}`);
    }
}

testAnalytics().catch(console.error);
