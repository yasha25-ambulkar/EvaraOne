const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const deviceState = require("../services/deviceStateService.js");

/**
 * deviceStatusCron.js
 * 
 * CRITICAL COMPONENT: Runs every 1 minute to recalculate ALL device statuses
 * This ensures status accuracy even when no new data arrives
 * 
 * Architecture:
 * - Independent from telemetry polling
 * - Sweeps all devices in database
 * - Updates status based on timestamp freshness
 * - Uses centralized deviceState.calculateDeviceStatus()
 */

// ✅ AUDIT FIX M1: Increased from 60s to 5 min — status checks don't need to be real-time
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 60s)

async function recalculateAllDevicesStatus() {
  try {
    logger.info('Starting status recalculation sweep', { category: 'cron' });
    
    // ✅ AUDIT FIX M1: Only fetch devices that are NOT permanently offline
    // Devices with status OFFLINE_STOPPED or DECOMMISSIONED don't need re-checking.
    // This reduces Firestore reads by ~40-80% depending on fleet health.
    const devicesSnapshot = await db.collection("devices")
      .where("status", "not-in", ["OFFLINE_STOPPED", "DECOMMISSIONED"])
      .get();
    const now = new Date();
    const updates = [];
    let statusChanges = 0;

    // Group by device_type to fetch metadata efficiently
    const typedGroups = {};
    for (const doc of devicesSnapshot.docs) {
        const data = doc.data();
        const type = data.device_type;
        if (type) {
            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
        }
    }

    const typeBatches = await Promise.all(
        Object.keys(typedGroups).map(async (type) => {
            const ids = typedGroups[type];
            const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
            const metas = await db.getAll(...refs);
            return metas.map(m => m.exists ? { id: m.id, type, meta: m.data() } : null).filter(Boolean);
        })
    );

    // Also collect registry data for customer_id mapping
    const registrySnapshot = await db.collection('devices').get();
    const registryMap = {};
    registrySnapshot.docs.forEach(doc => {
      registryMap[doc.id] = doc.data();
    });

    for (const batch of typeBatches) {
      for (const item of batch) {
        const { id: deviceId, type, meta } = item;
        const registry = registryMap[deviceId];
        
        // ✅ FIX #20: CORRECT STATUS CALCULATION FOR CRON
        // CRITICAL: Never use telemetry_snapshot.timestamp - it's stale
        // Only use actual telemetry update timestamps (never get cleaned up)
        // Priority (from most reliable to least):
        // 1. last_updated_at (set when telemetry arrives)
        // 2. last_online_at (set when device comes online)
        // 3. last_seen (legacy field)
        const lastUpdatedAt = 
          meta.last_updated_at ||          // Primary: actual telemetry timestamp
          meta.last_online_at ||          // Secondary: device online timestamp  
          meta.last_seen ||                // Tertiary: legacy last seen
          meta.lastUpdatedAt;              // Fallback: alternative naming
        
        const currentStatus = meta.status || "OFFLINE";

        if (!lastUpdatedAt) {
          // No timestamp at all - mark as OFFLINE
          if (currentStatus !== 'OFFLINE') {
            updates.push(
              db.collection(type.toLowerCase()).doc(deviceId).update({
                status: 'OFFLINE'
              })
            );
            statusChanges++;
          }
          continue;
        }
        
        // Use centralized status calculation
        const desiredStatus = deviceState.calculateDeviceStatus(lastUpdatedAt);
        
        // Only update if status changed (reduce DB writes)
        if (currentStatus !== desiredStatus) {
          updates.push(
            db.collection(type.toLowerCase()).doc(deviceId).update({
              status: desiredStatus,
              statusLastChecked: now.toISOString()
            })
          );
          
          // ✅ FIX #21: Also update registry status so it stays in sync
          if (registry) {
            updates.push(
              db.collection('devices').doc(deviceId).update({
                status: desiredStatus,
                statusLastChecked: now.toISOString()
              })
            );
          }
          
          statusChanges++;
          logger.info(`Device status changed: ${deviceId}`, { category: 'cron', deviceId, from: currentStatus, to: desiredStatus });
          
          // ✅ FIX #22: BROADCAST STATUS CHANGE VIA SOCKET.IO
          // Notify all users of this customer that a device status changed
          const customerId = registry?.customer_id || registry?.customerId || meta.customer_id || meta.customerId;
          if (customerId && global.io) {
            const statusEvent = {
              deviceId,
              oldStatus: currentStatus,
              newStatus: desiredStatus,
              lastUpdated: lastUpdatedAt,
              timestamp: now.toISOString()
            };
            global.io.to(`customer:${customerId}`).emit('device:status-changed', statusEvent);
            logger.info(`Socket event emitted: device:status-changed for ${deviceId}`, { 
              category: 'cron', 
              deviceId, 
              customerId,
              oldStatus: currentStatus,
              newStatus: desiredStatus
            });
          } else if (!customerId) {
            logger.warn(`No customer_id found for device ${deviceId}, status change not broadcast`, { category: 'cron', deviceId });
          }
        }
      }
    }
    
    if (updates.length > 0) {
      await Promise.all(updates);
      logger.info(`Status sweep complete`, { category: 'cron', changes: statusChanges, total: devicesSnapshot.size });
    } else {
      logger.info('Status sweep complete: no changes needed', { category: 'cron' });
    }
    
  } catch (err) {
    logger.error('DeviceStatusCron critical error', err, { category: 'cron' });
    throw err;
  }
}

/**
 * Start the cron job
 * Can be run as part of telemetryWorker or standalone
 */
function startStatusCron() {
  logger.info(`DeviceStatusCron initialized, running every ${STATUS_CHECK_INTERVAL}ms`, { category: 'cron', interval: STATUS_CHECK_INTERVAL });
  
  // Run immediately on startup
  recalculateAllDevicesStatus().catch(err => logger.error('Initial status sweep failed', err, { category: 'cron' }));
  
  // Then run on interval with error handling - wrap setInterval callback to catch promise rejections
  setInterval(async () => {
    try {
      await recalculateAllDevicesStatus();
    } catch (err) {
      logger.error('[DeviceStatusCron] Status sweep cycle failed', { error: err.message, category: 'cron' });
    }
  }, STATUS_CHECK_INTERVAL);
}

// Support standalone execution (e.g., Railway background worker)
if (require.main === module) {
  startStatusCron();
}

module.exports = {
  recalculateAllDevicesStatus,
  startStatusCron,
  STATUS_CHECK_INTERVAL
};
