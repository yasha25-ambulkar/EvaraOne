const { db, admin } = require("./config/firebase.js");
const logger = require("./utils/logger.js");

async function createMockOpsDevice() {
  try {
    const hardwareId = "EV-OPS-001";
    const deviceId = "mock-ops-device-id";

    // 1. Add to 'devices' collection (Registry)
    const deviceRef = db.collection("devices").doc(deviceId);
    await deviceRef.set({
      hardwareId: hardwareId,
      label: "Main Pump Controller",
      device_type: "EvaraOps",
      asset_type: "EvaraOps",
      analytics_template: "EvaraOps",
      customer_id: "ritik_id", // Mock ID for Ritik
      isVisibleToCustomer: true,
      status: "Online",
      last_seen: admin.firestore.Timestamp.now(),
      location_name: "Pump House A",
      zone_name: "Zone 1",
      latitude: 17.4447,
      longitude: 78.3484,
      created_at: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.Timestamp.now()
    });

    // 2. Add to 'evaraops' collection (Metadata/Config)
    const metaRef = db.collection("evaraops").doc(deviceId);
    await metaRef.set({
      hardwareId: hardwareId,
      name: "Main Pump Controller",
      analytics_template: "EvaraOps",
      configuration: {
        motor_capacity_hp: 5,
        phases: 3,
        rated_voltage: 415,
        rated_current: 7.5
      }
    });

    logger.info(`Mock EvaraOps device created: ${hardwareId}`);
    process.exit(0);
  } catch (err) {
    logger.error("Failed to create mock device:", err);
    process.exit(1);
  }
}

createMockOpsDevice();
