#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/config/firebase');

const channelId = process.argv[2];
if (!channelId) {
  console.error('Usage: node scan_channel_anywhere.js <CHANNEL_ID>');
  process.exit(1);
}

(async () => {
  try {
    console.log(`Scanning devices and typed metadata for substring: ${channelId}`);
    const devicesSnap = await db.collection('devices').get();
    const matches = [];

    for (const doc of devicesSnap.docs) {
      const id = doc.id;
      const data = doc.data();
      const str = JSON.stringify(data);
      if (str.includes(channelId)) {
        matches.push({ collection: 'devices', id, data });
        continue;
      }
      // Check typed collection if device has device_type
      const type = (data.device_type || data.deviceType || '').toString().toLowerCase();
      if (type) {
        try {
          const metaDoc = await db.collection(type).doc(id).get();
          if (metaDoc.exists) {
            const metaStr = JSON.stringify(metaDoc.data());
            if (metaStr.includes(channelId)) {
              matches.push({ collection: `${type}`, id, data: metaDoc.data() });
            }
          }
        } catch (e) {
          // ignore per-doc errors
        }
      }
    }

    if (matches.length === 0) {
      console.log('No matches found for channel in devices or typed metadata.');
      process.exit(0);
    }

    console.log(`Found ${matches.length} matches:`);
    matches.forEach(m => {
      console.log(`\n--- ${m.collection}/${m.id} ---`);
      console.log(JSON.stringify(m.data, null, 2));
    });
  } catch (err) {
    console.error('Scan failed:', err.message || err);
    process.exit(2);
  }
})();
