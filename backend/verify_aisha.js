require('dotenv').config({ path: '.env.development', override: true });
const admin = require('firebase-admin');

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

async function verify() {
  const db = admin.firestore();
  const snapshot = await db.collection('customers')
    .where('display_name', '==', 'Aisha Fix')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    console.log('❌ Customer Aisha Fix not found');
    process.exit(1);
  }
  
  const customer = snapshot.docs[0].data();
  console.log('✅ Customer Aisha Fix found!');
  console.log('📋 zone_id value:', customer.zone_id);
  console.log('📋 zone_id type:', typeof customer.zone_id);
  console.log('📋 zone_id empty?', customer.zone_id === '' || customer.zone_id === undefined);
  console.log('');
  console.log('Full customer data:');
  console.log(JSON.stringify(customer, null, 2));
  
  if (customer.zone_id && customer.zone_id !== '') {
    console.log('\n✅✅✅ SUCCESS: zone_id is persisted!');
  } else {
    console.log('\n❌❌❌ FAILURE: zone_id is still empty or missing');
  }
  
  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
