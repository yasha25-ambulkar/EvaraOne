/**
 * migrate_tank_dimensions.js
 * One-time migration script to update existing evaratank devices
 * with centimeter-based dimension fields (height_cm, length_cm, breadth_cm).
 *
 * Usage: node migrate_tank_dimensions.js
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const COLLECTION_NAME = 'devices'; // Using 'devices' based on codebase search

async function runMigration() {
    console.log(`\n🚀 Starting migration on collection: "${COLLECTION_NAME}"...\n`);

    try {
        // 1. Fetch all evaratank devices
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('device_type', 'in', ['evaratank', 'tank'])
            .get();

        if (snapshot.empty) {
            console.log('✅ No tank devices found for migration.');
            process.exit(0);
        }

        console.log(`Found ${snapshot.size} potential tank devices. Processing...\n`);

        const batch = db.batch();
        let updateCount = 0;
        let skipCount = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const config = data.configuration || {};

            // Skip if height_cm already exists
            if (config.height_cm !== undefined && config.height_cm !== null) {
                skipCount++;
                return;
            }

            // Calculate CM equivalents from existing meter fields
            const depth = config.depth || 0;
            const tankLength = config.tank_length || 0;
            const tankBreadth = config.tank_breadth || 0;

            const updates = {
                'configuration.height_cm': depth * 100,
                'configuration.length_cm': tankLength * 100,
                'configuration.breadth_cm': tankBreadth * 100
            };

            batch.update(doc.ref, updates);
            updateCount++;
            console.log(`[PENDING] ${doc.id}: depth=${depth}m -> height_cm=${updates['configuration.height_cm']}`);
        });

        if (updateCount === 0) {
            console.log(`\n✅ Migration complete. All devices were already up to date (Skipped: ${skipCount}).`);
            process.exit(0);
        }

        // 2. Commit batch
        console.log(`\n⏳ Committing ${updateCount} updates to Firestore...`);
        await batch.commit();

        console.log(`\n✅ SUCCESS! Migration finished.`);
        console.log(`   - Total Processed: ${snapshot.size}`);
        console.log(`   - Updated:         ${updateCount}`);
        console.log(`   - Skipped:         ${skipCount}`);

    } catch (error) {
        console.error('\n❌ MIGRATION FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }

    process.exit(0);
}

runMigration();
