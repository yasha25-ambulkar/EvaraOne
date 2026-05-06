require('dotenv').config();
const { getDeviceState } = require('./src/services/deviceStateService');
const { db } = require('./src/config/firebase');

async function testService() {
  const doc = await db.collection('devices').doc('EV-TNK-003').get();
  const device = { id: doc.id, ...doc.data() };
  
  const state = await getDeviceState(device);
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

testService();
