const { db } = require("./config/firebase.js");
const logger = require("./utils/logger.js");

async function checkDevice() {
  try {
    const devices = await db.collection("evaratds").get();
    devices.forEach(doc => {
      if (doc.data().label === "KRB TDS" || doc.data().device_name === "KRB TDS" || doc.id === "08eTfG8Z3t0H5O5F4M00") {
        logger.debug("Found device:", doc.id);
        logger.debug("Metadata:", JSON.stringify(doc.data(), null, 2));
      }
    });

    const registry = await db.collection("devices").get();
    registry.forEach(doc => {
        if (doc.data().device_type === "tds" || doc.data().device_type === "evaratds") {
          logger.debug("Found registry (tds):", doc.id);
          logger.debug("Registry Data:", JSON.stringify(doc.data(), null, 2));
        }
    });
    process.exit(0);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

checkDevice();
