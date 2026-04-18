/**
 * TEST: Can resolveDevice find EV-TDS-001?
 */

require('dotenv').config();
const resolveDevice = require('./src/utils/resolveDevice.js');

async function test() {
  console.log('\n' + '═'.repeat(80));
  console.log('TEST: resolveDevice("EV-TDS-001")');
  console.log('═'.repeat(80) + '\n');

  try {
    const device = await resolveDevice('EV-TDS-001');
    
    if (device) {
      console.log('✅ FOUND!\n');
      console.log('ID:', device.id);
      console.log('Data:', JSON.stringify(device.data(), null, 2));
    } else {
      console.log('❌ NOT FOUND');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

test();
