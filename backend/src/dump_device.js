const { db } = require("./config/firebase.js");

async function checkDevice() {
  try {
    const devices = await db.collection("evaratds").get();
    devices.forEach(doc => {
      if (doc.data().label === "KRB TDS" || doc.data().device_name === "KRB TDS" || doc.id === "08eTfG8Z3t0H5O5F4M00") {
        console.log("Found device:", doc.id);
        console.log("Metadata:", JSON.stringify(doc.data(), null, 2));
      }
    });

    const registry = await db.collection("devices").get();
    registry.forEach(doc => {
        if (doc.data().device_type === "tds" || doc.data().device_type === "evaratds") {
          console.log("Found registry (tds):", doc.id);
          console.log("Registry Data:", JSON.stringify(doc.data(), null, 2));
        }
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDevice();
