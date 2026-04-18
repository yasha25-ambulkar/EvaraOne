require('dotenv').config();
const { db } = require('./src/config/firebase');

(async () => {
  try {
    console.log('🔧 Fixing TDS Field Mapping...\n');

    // Get the registry ID
    const registrySnapshot = await db.collection('devices')
      .where('device_type', '==', 'evaratds')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (registrySnapshot.empty) {
      console.error('❌ Device not found in registry');
      return;
    }

    const registryId = registrySnapshot.docs[0].id;
    console.log(`📍 Found registry ID: ${registryId}\n`);

    // Update the sensor_field_mapping in metadata
    const newMapping = {
      field1: 'voltage',        // 0.104
      field2: 'tds_value',      // 56 (actual TDS)
      field3: 'temperature'     // actual temperature value
    };

    await db.collection('evaratds').doc(registryId).update({
      sensor_field_mapping: newMapping
    });

    console.log('✅ Field mapping updated!\n');
    console.log('New mapping:');
    console.log('  field1 (voltage): 0.104');
    console.log('  field2 (tds_value): 56 ppm ← This will now show in TDS LEVEL');
    console.log('  field3 (temperature): actual temp value\n');

    console.log('Changes:');
    console.log('  ✓ TDS LEVEL will now show: 56 ppm (from field2)');
    console.log('  ✓ TEMPERATURE will now show: actual value (from field3)');
    console.log('  ✓ Voltage (field1) will be ignored in display\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
