#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/config/firebase');

async function main() {
  const [collection, docId] = process.argv.slice(2);
  if (!collection || !docId) {
    console.error('Usage: node print_typed_doc_summary.js <collection> <docId>');
    process.exit(2);
  }

  try {
    const doc = await db.collection(collection).doc(docId).get();
    if (!doc.exists) {
      console.error('Document not found');
      process.exit(1);
    }
    const data = doc.data();
    const summary = {
      id: doc.id,
      channel_id: data.thingspeak_channel_id || data.channel_id || null,
      last_telemetry: data.telemetry_snapshot || data.last_telemetry || null,
      last_seen: data.last_seen || data.last_updated_at || null,
      status: data.status || null,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
