
const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

function resolveFields(device, mapping, latestFeed) {
  const fieldFlow =
    device.flow_rate_field || device.flowField ||
    mapping.flowField || mapping.flow_rate_field ||
    Object.keys(mapping).find(k => flowKeys.includes(mapping[k])) ||
    (latestFeed.field4 !== undefined ? "field4" : "field3");

  const fieldTotal =
    device.meter_reading_field || device.volumeField ||
    mapping.volumeField || mapping.meter_reading_field ||
    Object.keys(mapping).find(k => totalKeys.includes(mapping[k])) ||
    (latestFeed.field5 !== undefined ? "field5" : "field1");

  return { fieldFlow, fieldTotal };
}

// Case 1: Custom mapping in sensor_field_mapping (User's case)
const device1 = { id: 'dev1', type: 'flow_meter' };
const mapping1 = { field8: 'current_reading', field3: 'flow_rate' };
const feed1 = { field1: '0', field3: '10', field8: '7982' };

const result1 = resolveFields(device1, mapping1, feed1);
console.log('Case 1 (Custom Mapping):', result1);
if (result1.fieldFlow === 'field3' && result1.fieldTotal === 'field8') {
  console.log('✅ Case 1 Passed');
} else {
  console.log('❌ Case 1 Failed');
}

// Case 2: Registry precedence
const device2 = { id: 'dev2', type: 'flow_meter', flow_rate_field: 'field2', meter_reading_field: 'field7' };
const mapping2 = { field3: 'flow_rate', field8: 'current_reading' };
const feed2 = { field2: '10', field7: '5000' };

const result2 = resolveFields(device2, mapping2, feed2);
console.log('Case 2 (Registry Precedence):', result2);
if (result2.fieldFlow === 'field2' && result2.fieldTotal === 'field7') {
  console.log('✅ Case 2 Passed');
} else {
  console.log('❌ Case 2 Failed');
}

// Case 3: Fallback (No mapping, no registry)
const device3 = { id: 'dev3', type: 'flow_meter' };
const mapping3 = {};
const feed3 = { field1: '100', field3: '5', field4: '10', field5: '20' };

const result3 = resolveFields(device3, mapping3, feed3);
console.log('Case 3 (Fallback):', result3);
if (result3.fieldFlow === 'field4' && result3.fieldTotal === 'field5') {
  console.log('✅ Case 3 Passed');
} else {
  console.log('❌ Case 3 Failed');
}

// Case 4: Deep Fallback (Only field1 and field3)
const device4 = { id: 'dev4', type: 'flow_meter' };
const mapping4 = {};
const feed4 = { field1: '100', field3: '5' };

const result4 = resolveFields(device4, mapping4, feed4);
console.log('Case 4 (Deep Fallback):', result4);
if (result4.fieldFlow === 'field3' && result4.fieldTotal === 'field1') {
  console.log('✅ Case 4 Passed');
} else {
  console.log('❌ Case 4 Failed');
}
