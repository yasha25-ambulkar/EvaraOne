/**
 * PROVISION: Create superadmin user in Firestore if not exists
 * Useful when a user logs in via Firebase but hasn't been provisioned in Firestore
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function provision() {
  console.log('\n' + '═'.repeat(80));
  console.log('USER PROVISIONING SCRIPT');
  console.log('═'.repeat(80) + '\n');

  // Get user ID from command line or use Ritik's ID
  const uid = process.argv[2] || '5vAwCRibuEV3r0sZze8PEtV2qzQ2';
  const displayName = process.argv[3] || 'Ritik';
  const email = process.argv[4] || 'ritik@gmail.com';

  try {
    console.log(`Checking if user exists: ${uid}\n`);
    
    const superadminRef = db.collection('superadmins').doc(uid);
    const snap = await superadminRef.get();

    if (snap.exists) {
      console.log('✅ User already exists in superadmins collection');
      console.log('Data:', JSON.stringify(snap.data(), null, 2));
    } else {
      console.log('❌ User NOT in superadmins collection');
      console.log(`\n📝 Creating user: ${displayName} (${uid})\n`);
      
      await superadminRef.set({
        uid,
        display_name: displayName,
        email,
        role: 'superadmin',
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log('✅ User created successfully!\n');
      console.log('User can now:');
      console.log('  - Login to the dashboard');
      console.log('  - Access all devices');
      console.log('  - View analytics');
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

provision();
