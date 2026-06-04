/**
 * validate_firestore_architecture.js
 * 
 * ✅ VALIDATION SCRIPT
 * 
 * Verifies that Firestore device documents follow the clean architecture:
 * - Config + metadata only (NOT telemetry history)
 * - ThingSpeak API for live/historical data
 * - Lightweight status fields
 * 
 * Usage: node validate_firestore_architecture.js
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const EXPECTED_FIELDS = {
  // Identity
  device_id: 'string',
  device_type: 'string',
  node_id: 'string',
  label: 'string',
  device_name: 'string',
  
  // Owner
  customer_id: 'string',
  zone_id: 'string',
  
  // ThingSpeak config
  thingspeak_channel_id: 'string',
  thingspeak_read_api_key: 'string',
  
  // Field mapping
  fields: 'object',
  sensor_field_mapping: 'object',
  
  // Configuration
  configuration: 'object',
  
  // Status (lightweight)
  status: 'string',
  last_seen: ['string', 'date', 'null'],
  lastUpdated: ['date', 'null'],
  
  // Location
  latitude: ['number', 'null'],
  longitude: ['number', 'null'],
  
  // Timestamps
  created_at: ['date', 'null'],
  updated_at: ['date', 'null']
};

const BLOATED_FIELDS = [
  'tdsHistory',
  'tempHistory',
  'temperatureHistory',
  'telemetryHistory',
  'history',
  'raw_data',
  'rawData',
  'telemetrySnapshot',
  'telemetry_snapshot',
  'lastTelemetryFetch',
  'last_telemetry_fetch'
];

function getType(value) {
  if (value === null) return 'null';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

async function validateDevice(doc) {
  const data = doc.data();
  const issues = [];
  const warnings = [];
  
  // Check for bloated fields
  const bloatedFound = BLOATED_FIELDS.filter(field => field in data);
  if (bloatedFound.length > 0) {
    issues.push(`Has bloated telemetry fields: ${bloatedFound.join(', ')}`);
  }
  
  // Check document size
  const sizeInBytes = JSON.stringify(data).length;
  if (sizeInBytes > 10000) { // > 10KB
    warnings.push(`Document is ${(sizeInBytes / 1024).toFixed(2)} KB (should be < 5KB)`);
  }
  
  // Verify ThingSpeak config exists
  if (!data.thingspeak_channel_id || !data.thingspeak_read_api_key) {
    warnings.push(`Missing ThingSpeak credentials (data will come from API only)`);
  }
  
  // Check for required fields
  if (!data.device_id && !data.label) {
    issues.push(`Missing device_id and label`);
  }
  
  // Validate field mappings
  if (data.fields && typeof data.fields !== 'object') {
    issues.push(`fields must be an object`);
  }
  if (data.sensor_field_mapping && typeof data.sensor_field_mapping !== 'object') {
    issues.push(`sensor_field_mapping must be an object`);
  }
  
  return {
    docId: doc.id,
    device_name: data.device_name || data.label || 'Unknown',
    device_type: data.device_type || 'Unknown',
    sizeInBytes,
    sizeInKB: (sizeInBytes / 1024).toFixed(2),
    issues,
    warnings,
    isValid: issues.length === 0
  };
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✔️  FIRESTORE ARCHITECTURE VALIDATOR                      ║');
  console.log('║  Verifies clean device document structure                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const snapshot = await db.collection('devices').get();
    const validations = await Promise.all(
      snapshot.docs.map(doc => validateDevice(doc))
    );

    const validCount = validations.filter(v => v.isValid).length;
    const totalCount = validations.length;
    const avgSize = validations.reduce((sum, v) => sum + v.sizeInBytes, 0) / totalCount;
    const maxSize = Math.max(...validations.map(v => v.sizeInBytes));

    // Summary
    console.log('📊 VALIDATION SUMMARY:\n');
    console.log(`   Total devices:         ${totalCount}`);
    console.log(`   Valid (clean):         ${validCount} (${((validCount/totalCount)*100).toFixed(1)}%)`);
    console.log(`   Invalid (bloated):     ${totalCount - validCount}`);
    console.log(`   Average size:          ${(avgSize / 1024).toFixed(2)} KB`);
    console.log(`   Max size:              ${(maxSize / 1024).toFixed(2)} KB`);
    console.log(`   Target:                < 5 KB per document\n`);

    // Details
    const invalid = validations.filter(v => !v.isValid || v.warnings.length > 0);
    if (invalid.length > 0) {
      console.log('⚠️  DEVICES WITH ISSUES:\n');
      invalid.slice(0, 10).forEach((device, idx) => {
        console.log(`  ${idx + 1}. ${device.device_name} (${device.device_type})`);
        console.log(`     Size: ${device.sizeInKB} KB`);
        if (device.issues.length > 0) {
          console.log(`     ❌ Issues:`);
          device.issues.forEach(issue => console.log(`        - ${issue}`));
        }
        if (device.warnings.length > 0) {
          console.log(`     ⚠️  Warnings:`);
          device.warnings.forEach(warn => console.log(`        - ${warn}`));
        }
        console.log('');
      });

      if (invalid.length > 10) {
        console.log(`  ... and ${invalid.length - 10} more devices\n`);
      }

      console.log('💡 TO FIX: Run cleanup_firestore_telemetry.js\n');
    } else {
      console.log('✅ ALL DEVICES ARE CLEAN!\n');
    }

    // Architecture guide
    console.log('📐 EXPECTED DEVICE STRUCTURE:\n');
    console.log('   ✓ Identity: device_id, device_type, label, device_name');
    console.log('   ✓ Owner: customer_id, zone_id');
    console.log('   ✓ Config: thingspeak_channel_id, thingspeak_read_api_key');
    console.log('   ✓ Fields: fields, sensor_field_mapping, configuration');
    console.log('   ✓ Status: status, last_seen, lastUpdated (lightweight)');
    console.log('   ✓ Location: latitude, longitude');
    console.log('   ✗ NEVER: tdsHistory, tempHistory, telemetryHistory, raw_data\n');

    console.log('📚 DATA FLOW:\n');
    console.log('   Device Config       → Firestore "devices" collection');
    console.log('   Live Readings       → ThingSpeak API (fetch on-demand)');
    console.log('   Historical Data     → ThingSpeak API (fetch via analytics)');
    console.log('   Status/Metadata     → Firestore (lightweight only)\n');

    console.log('╔════════════════════════════════════════════════════════════╗');
    if (validCount === totalCount) {
      console.log('║  ✅ Architecture Validation PASSED                        ║');
    } else {
      console.log('║  ❌ Architecture Validation FAILED - run cleanup script   ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(validCount === totalCount ? 0 : 1);
  } catch (error) {
    console.error('❌ VALIDATION ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
