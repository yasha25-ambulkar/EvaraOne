#!/usr/bin/env node
require('dotenv').config();
const { admin, db } = require('../src/config/firebase');

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node print_typed_doc.js <collection> <docId>');
    process.exit(2);
  }

  const [collection, docId] = args;
  try {
    const doc = await db.collection(collection).doc(docId).get();
    if (!doc.exists) {
      console.error(`Document not found: ${collection}/${docId}`);
      process.exit(1);
    }

    console.log(JSON.stringify({ id: doc.id, data: doc.data() }, null, 2));
  } catch (err) {
    console.error('Error fetching document:', err.message);
    process.exit(1);
  }
}

main();
