#!/usr/bin/env node
/**
 * fix_device_customer_ids.js
 * 
 * Fixes mismatched customer_id on device documents in Firestore.
 * Compares each device's customer_id against actual customer document IDs
 * and updates devices whose customer_id doesn't match any real customer.
 * 
 * Usage:
 *   node backend/scripts/fix_device_customer_ids.js          (dry-run, shows what would change)
 *   node backend/scripts/fix_device_customer_ids.js --apply   (actually writes changes)
 */

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.development"),
});

const admin = require("firebase-admin");

// Initialize Firebase Admin using env vars
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Missing Firebase Admin credentials in environment.");
    console.error("   FIREBASE_PROJECT_ID:", projectId || "(missing)");
    console.error("   FIREBASE_CLIENT_EMAIL:", clientEmail || "(missing)");
    console.error("   FIREBASE_PRIVATE_KEY:", privateKey ? "(set)" : "(missing)");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
  console.log(`✅ Connected to Firebase project: ${projectId}`);
}

const db = admin.firestore();
const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(DRY_RUN ? "\n🔍 DRY RUN — no changes will be written\n" : "\n🔧 APPLY MODE — changes will be written\n");

  // 1. Fetch all customers and build a map: docId → customer data
  const customersSnap = await db.collection("customers").get();
  const customerMap = new Map();
  customersSnap.docs.forEach((doc) => {
    customerMap.set(doc.id, { id: doc.id, ...doc.data() });
  });
  console.log(`📋 Found ${customerMap.size} customers:`);
  for (const [id, c] of customerMap) {
    console.log(`   ${id} → ${c.display_name || c.full_name || c.email || "(no name)"}`);
  }

  // 2. Fetch all devices
  const devicesSnap = await db.collection("devices").get();
  console.log(`\n📱 Found ${devicesSnap.size} devices\n`);

  let matchCount = 0;
  let mismatchCount = 0;
  let noCustomerIdCount = 0;
  let fixedCount = 0;

  for (const deviceDoc of devicesSnap.docs) {
    const device = { id: deviceDoc.id, ...deviceDoc.data() };
    const deviceCustomerId = device.customer_id || device.customerId || device.customerID || null;

    if (!deviceCustomerId) {
      console.log(`⚠️  ${device.id} (${device.device_name || device.device_id || "?"}) — no customer_id set`);
      noCustomerIdCount++;
      continue;
    }

    // Check if the customer_id matches any actual customer document
    if (customerMap.has(deviceCustomerId)) {
      const customer = customerMap.get(deviceCustomerId);
      console.log(`✅ ${device.id} (${device.device_name || "?"}) → customer_id matches "${customer.display_name || customer.email}"`);
      matchCount++;
    } else {
      mismatchCount++;
      console.log(`❌ ${device.id} (${device.device_name || "?"}) → customer_id "${deviceCustomerId}" DOES NOT MATCH any customer!`);

      // Try to find the correct customer by fuzzy/partial match
      let bestMatch = null;
      let bestScore = 0;

      for (const [custId, cust] of customerMap) {
        // Score based on how many characters match at the start
        let score = 0;
        const minLen = Math.min(deviceCustomerId.length, custId.length);
        for (let i = 0; i < minLen; i++) {
          if (deviceCustomerId[i] === custId[i]) score++;
          else break;
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { id: custId, ...cust };
        }
      }

      if (bestMatch && bestScore >= 10) {
        console.log(`   🔍 Best match: ${bestMatch.id} → "${bestMatch.display_name || bestMatch.email}" (${bestScore} chars match)`);

        if (!DRY_RUN) {
          try {
            await db.collection("devices").doc(device.id).update({
              customer_id: bestMatch.id,
            });
            console.log(`   ✅ UPDATED customer_id to ${bestMatch.id}`);
            fixedCount++;
          } catch (err) {
            console.log(`   ❌ FAILED to update: ${err.message}`);
          }
        } else {
          console.log(`   ℹ️  Would update customer_id to ${bestMatch.id} (dry run)`);
        }
      } else {
        console.log(`   ⚠️  No close match found. Manual review needed.`);
        
        // If there's only one customer, assign to that customer
        if (customerMap.size === 1) {
          const [onlyCustomerId] = [...customerMap.keys()];
          const onlyCustomer = customerMap.get(onlyCustomerId);
          console.log(`   🔍 Only 1 customer exists: ${onlyCustomerId} → "${onlyCustomer.display_name || onlyCustomer.email}"`);
          
          if (!DRY_RUN) {
            try {
              await db.collection("devices").doc(device.id).update({
                customer_id: onlyCustomerId,
              });
              console.log(`   ✅ UPDATED customer_id to ${onlyCustomerId}`);
              fixedCount++;
            } catch (err) {
              console.log(`   ❌ FAILED to update: ${err.message}`);
            }
          } else {
            console.log(`   ℹ️  Would update customer_id to ${onlyCustomerId} (dry run)`);
          }
        }
      }
    }
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("📊 SUMMARY:");
  console.log(`   Total devices:       ${devicesSnap.size}`);
  console.log(`   ✅ Matched:           ${matchCount}`);
  console.log(`   ❌ Mismatched:        ${mismatchCount}`);
  console.log(`   ⚠️  No customer_id:    ${noCustomerIdCount}`);
  if (!DRY_RUN) {
    console.log(`   🔧 Fixed:             ${fixedCount}`);
  }
  console.log("═".repeat(60));

  if (DRY_RUN && mismatchCount > 0) {
    console.log("\n💡 Run with --apply to fix the mismatches:");
    console.log("   node backend/scripts/fix_device_customer_ids.js --apply");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
