#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/config/firebase');

const channel = process.argv[2];
if (!channel) {
  console.error('Usage: node find_channel_short.js <CHANNEL>');
  process.exit(1);
}

(async () => {
  try {
    console.log(`Scanning for '${channel}' ...`);
    const devicesSnap = await db.collection('devices').get();
    let found = 0;
    for (const doc of devicesSnap.docs) {
      const id = doc.id;
      const data = doc.data();
      const str = JSON.stringify(data);
      if (str.includes(channel)) {
        console.log(`devices/${id}`);
        found++;
        continue;
      }
      const type = (data.device_type || data.deviceType || '').toString().toLowerCase();
      if (!type) continue;
      try {
        const metaDoc = await db.collection(type).doc(id).get();
        if (metaDoc.exists) {
          const metaStr = JSON.stringify(metaDoc.data());
          if (metaStr.includes(channel)) {
            console.log(`${type}/${id}`);
            found++;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (found === 0) console.log('No matches');
    else console.log(`Found ${found} matches`);
    process.exit(0);
  } catch (err) {
    console.error('Scan failed:', err.message || err);
    process.exit(2);
  }
})();