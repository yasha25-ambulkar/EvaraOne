/**
 * RECREATE: Restore EV-TDS-001 metadata to evaratds collection
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function recreate() {
  console.log('\n' + '═'.repeat(80));
  console.log('RECREATING TDS METADATA');
  console.log('═'.repeat(80) + '\n');

  try {
    // Get the registry entry
    const regQuery = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (regQuery.empty) {
      console.error('❌ EV-TDS-001 registry not found!');
      process.exit(1);
    }

    const regDoc = regQuery.docs[0];
    const registryId = regDoc.id;
    const registry = regDoc.data();

    console.log(`Found registry entry: ${registryId}\n`);

    // Create metadata document
    const metadata = {
      // Core device info
      device_id: 'EV-TDS-001',
      node_id: 'EV-TDS-001',
      label: 'TDS Meter',
      device_name: 'TDS Meter',
      device_type: 'evaratds',
      
      // Customer and zone
      customer_id: registry.customer_id,
      zone_id: 'default-zone',
      
      // ThingSpeak integration (CRITICAL)
      thingspeak_channel_id: '2713286',
      thingspeak_read_api_key: 'YOUR_THINGSPEAK_READ_KEY', // Placeholder
      
      // Geolocation
      latitude: 0,
      longitude: 0,
      
      // Timestamps
      created_at: new Date(),
      updated_at: new Date(),
      
      // Configuration
      configuration: {
        min_threshold: 0,
        max_threshold: 2000,
        alert_enabled: true
      },
      
      // Field mapping for ThingSpeak
      fields: {
        field1: 'tds_value',
        field2: 'temperature',
        field3: 'turbidity',
        field4: 'ph',
        field5: 'conductivity'
      },
      
      sensor_field_mapping: {
        field1: 'tds_value',
        field2: 'temperature'
      }
    };

    // Write to evaratds collection using the registry ID as document ID
    console.log(`Writing metadata to evaratds/${registryId}...\n`);
    
    await db.collection('evaratds').doc(registryId).set(metadata);

    console.log('✅ Metadata created successfully!\n');
    console.log('Document ID: ' + registryId);
    console.log('Fields created:');
    for (const [key, val] of Object.entries(metadata)) {
      if (typeof val === 'object') {
        console.log(`  ${key}: [object]`);
      } else {
        console.log(`  ${key}: ${val}`);
      }
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

recreate();
