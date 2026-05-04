
require('dotenv').config();
const { db } = require('../src/config/firebase');
const { getNodeDetails } = require('../src/services/deviceLookupService');
const { getTDSDeviceState, getTDSHistory } = require('../src/services/tdsStateService');

async function debugTDS() {
  const hardwareId = 'EV-TDS-001';
  console.log(`--- Debugging ${hardwareId} ---`);
  
  const device = await getNodeDetails(hardwareId);
  console.log('Enriched Device Data:', JSON.stringify(device, null, 2));
  
  const state = await getTDSDeviceState(device);
  console.log('\n--- State Object ---');
  console.log(JSON.stringify(state, null, 2));
  
  const history = await getTDSHistory(device, 5);
  console.log('\n--- History (Last 5) ---');
  console.log(JSON.stringify(history, null, 2));
}

debugTDS().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
