require('dotenv').config();
const admin = require("firebase-admin");
const { db } = require("./src/config/firebase.js");

const OBH_API_KEY = process.env.THINGSPEAK_API_KEY_KRB;
if (!OBH_API_KEY) {
    console.error("Error: THINGSPEAK_API_KEY_KRB not defined in .env");
    process.exit(1);
}

async function fixOBH() {
    console.log("Updating OBH Tank config...");
    const obhId = "UxSim3VQh2qI232wDgHo";
    // Using KRB Tank's channel just so it has some data to show
    await db.collection("evaratank").doc(obhId).update({
        thingspeak_channel_id: "2613745",
        thingspeak_read_api_key: OBH_API_KEY,
        sensor_field_mapping: {
            "field2": "water_level_raw_sensor_reading"
        }
    });

    console.log("Successfully updated OBH Tank ThingSpeak configuration.");
}
fixOBH().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
