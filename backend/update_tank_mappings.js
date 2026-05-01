require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function updateTankMappings() {
  console.log("Starting tank mapping update...");
  try {
    const snapshot = await db.collection('devices')
      .where('device_type', 'in', ['evaratank', 'tank', 'sump', 'EvaraTank'])
      .get();
      
    console.log(`Found ${snapshot.size} tank devices to update.`);
    
    let updatedCount = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const currentFields = data.fields || {};
      const currentMapping = data.sensor_field_mapping || {};
      
      // Update logic: distance is field2, temperature is field1
      const updatedFields = {
        ...currentFields,
        water_level: 'field2',
        temperature: 'field1'
      };
      
      const updatedMapping = {
        ...currentMapping,
        field2: 'water_level_raw_sensor_reading',
        field1: 'temperature'
      };
      
      await db.collection('devices').doc(doc.id).update({
        fields: updatedFields,
        sensor_field_mapping: updatedMapping
      });
      
      console.log(`✅ Updated ${doc.id} (${data.label})`);
      updatedCount++;
    }
    
    console.log(`Successfully updated ${updatedCount} devices.`);
  } catch (error) {
    console.error("Error updating tank mappings:", error);
  } finally {
    process.exit(0);
  }
}

updateTankMappings();
