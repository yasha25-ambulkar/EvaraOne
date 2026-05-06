require('dotenv').config();
const { db } = require('./src/config/firebase');

async function findHimalaya() {
  const snapshot = await db.collection('devices').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.thingspeak_channel_id === '3275001' || data.channel_id === '3275001') {
      console.log(`Found device using Himalaya channel: ${doc.id} (${data.label})`);
      return;
    }
  }
  console.log('No device found using Himalaya channel (3275001)');
  process.exit(0);
}

findHimalaya();
