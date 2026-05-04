require('dotenv').config();
const { db } = require('./src/config/firebase');

async function checkDevice() {
  const deviceId = 'EV-TDS-001';
  const doc = await db.collection('devices').doc(deviceId).get();
  if (!doc.exists) {
    console.log('Device not found');
    return;
  }
  console.log('Device Data:', JSON.stringify(doc.data(), null, 2));
}

checkDevice();
