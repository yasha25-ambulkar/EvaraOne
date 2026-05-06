require('dotenv').config();
const { db } = require('./src/config/firebase');

async function repairBakulTank() {
  console.log('--- Repairing Bakul Tank Config ---');
  const deviceId = 'EV-TNK-003';
  const deviceRef = db.collection('devices').doc(deviceId);
  
  const doc = await deviceRef.get();
  if (!doc.exists) {
    console.error('Device EV-TNK-003 not found');
    process.exit(1);
  }

  // Update mapping to correct format: { water_level: 'field1' }
  // instead of { field1: 'water_level_raw_sensor_reading' }
  await deviceRef.update({
    sensor_field_mapping: {
      water_level: 'field1'
    }
  });

  console.log('✅ Bakul Tank (EV-TNK-003) field mapping updated to { water_level: "field1" }');
  
  // Also check if OBH Tank needs correction
  const obhRef = db.collection('devices').doc('EV-TNK-001');
  const obhDoc = await obhRef.get();
  if (obhDoc.exists) {
    const data = obhDoc.data();
    if (!data.sensor_field_mapping || !data.sensor_field_mapping.water_level) {
       await obhRef.update({
         sensor_field_mapping: {
           water_level: 'field2'
         }
       });
       console.log('✅ OBH Tank mapping updated to { water_level: "field2" }');
    }
  }

  process.exit(0);
}

repairBakulTank().catch(err => {
  console.error(err);
  process.exit(1);
});
