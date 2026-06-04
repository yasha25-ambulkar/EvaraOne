const { db } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js");

const VALID_ACTIONS = new Set(["OPEN", "CLOSED"]);

exports.updateValveCommand = async (req, res) => {
  try {
    const deviceDoc = req.deviceDoc;
    const device = req.device;
    const action = String(req.body?.action || "").trim().toUpperCase();
    const rawAutoShutoffLimit = req.body?.autoShutoffLimit;

    if (!deviceDoc || !device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const deviceType = String(device.device_type || "").trim().toLowerCase();
    if (deviceType !== "evaravalve" && deviceType !== "valve") {
      return res.status(400).json({ error: "Command endpoint is only valid for valve devices" });
    }

    const update = {
      valve_status: action,
      updated_at: new Date(),
    };

    if (rawAutoShutoffLimit !== undefined) {
      const parsedLimit = Number(rawAutoShutoffLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: "autoShutoffLimit must be a positive number" });
      }
      update.auto_shutoff_limit = parsedLimit;
    }

    await db.collection("devices").doc(deviceDoc.id).update(update);
    await Promise.all([
      cache.flushPrefix("user:"),
      cache.flushPrefix("dashboard_init_"),
      cache.flushPrefix("dashboard_summary_"),
    ]);

    const customerId = device.customer_id || device.customerId;
    if (customerId && global.io) {
      global.io.to(`customer:${customerId}`).emit("device:updated", {
        deviceId: deviceDoc.id,
        changes: update,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(202).json({
      success: true,
      deviceId: deviceDoc.id,
      command: {
        action,
        autoShutoffLimit: update.auto_shutoff_limit,
      },
    });
  } catch (error) {
    logger.error("[DeviceCommands] Failed to update valve command", error);
    return res.status(500).json({ error: "Failed to update valve command" });
  }
};
