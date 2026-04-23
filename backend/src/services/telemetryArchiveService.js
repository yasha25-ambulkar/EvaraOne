/**
 * Telemetry Archive Service
 * 
 * Manages data retention policy:
 * - Keeps last 14 days in database for fast access
 * - Archives data older than 30 days to ThingSpeak
 * - Automatic daily cleanup
 */

const admin = require("firebase-admin");
const axios = require("axios");
const logger = require("../utils/logger");

const db = admin.firestore();

class TelemetryArchiveService {
  /**
   * Get retention window configuration
   */
  static getRetentionPolicy() {
    return {
      keepDays: 14,          // Keep this many days in database
      archiveAfterDays: 30,  // Archive after this many days
      cleanupHour: 2,        // Daily cleanup at 2 AM
      cleanupMinute: 0,
    };
  }

  /**
   * Calculate date thresholds
   */
  static calculateDateThresholds() {
    const now = new Date();
    const policy = this.getRetentionPolicy();

    const keepUntilDate = new Date(now);
    keepUntilDate.setDate(keepUntilDate.getDate() - policy.keepDays);

    const archiveAfterDate = new Date(now);
    archiveAfterDate.setDate(archiveAfterDate.getDate() - policy.archiveAfterDays);

    return {
      now,
      keepUntilDate,
      archiveAfterDate,
      cutoffTimestamp: keepUntilDate.getTime(),
      archiveTimestamp: archiveAfterDate.getTime(),
    };
  }

  /**
   * Clean up telemetry data older than retention window
   * Runs daily
   */
  static async cleanupOldTelemetry() {
    try {
      logger.info("🧹 Starting telemetry cleanup process...");

      const thresholds = this.calculateDateThresholds();
      const archiveAfter = new Date(thresholds.archiveTimestamp);

      logger.info(`📅 Cleanup threshold: ${archiveAfter.toISOString()}`);

      // Get all devices
      const devicesSnapshot = await db.collection("devices").get();

      let totalDeletedRecords = 0;
      let devicesProcessed = 0;

      for (const deviceDoc of devicesSnapshot.docs) {
        try {
          const deviceId = deviceDoc.id;
          const deleted = await this.cleanupDeviceTelemetry(deviceId, archiveAfter);
          totalDeletedRecords += deleted;
          devicesProcessed++;

          logger.debug(`✅ Device ${deviceId}: Deleted ${deleted} records`);
        } catch (error) {
          logger.error(`❌ Error cleaning device ${deviceDoc.id}:`, error.message);
        }
      }

      logger.info(
        `✅ Cleanup complete: ${devicesProcessed} devices, ${totalDeletedRecords} records deleted`
      );

      return {
        success: true,
        devicesProcessed,
        recordsDeleted: totalDeletedRecords,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("❌ Cleanup failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clean telemetry for a specific device
   */
  static async cleanupDeviceTelemetry(deviceId, archiveAfterDate) {
    try {
      const telemetryRef = db.collection("devices").doc(deviceId).collection("telemetry");

      // Query records older than archive threshold
      const oldRecordsQuery = telemetryRef.where(
        "timestamp",
        "<",
        admin.firestore.Timestamp.fromDate(archiveAfterDate)
      );

      const oldRecordsSnapshot = await oldRecordsQuery.get();

      if (oldRecordsSnapshot.empty) {
        return 0;
      }

      // Delete in batches
      const batch = db.batch();
      let count = 0;

      oldRecordsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        count++;

        // Firebase batch limit is 500
        if (count % 500 === 0) {
          logger.debug(`Processing batch of ${count} deletes...`);
        }
      });

      if (count > 0) {
        await batch.commit();
        logger.debug(`✅ Deleted ${count} telemetry records for device ${deviceId}`);
      }

      return count;
    } catch (error) {
      logger.error(`Error cleaning device ${deviceId}:`, error);
      return 0;
    }
  }

  /**
   * Get telemetry age category
   * Returns: "recent" (0-14 days), "cached" (14-30 days), "archived" (>30 days)
   */
  static getDataAgeCategory(timestamp) {
    const now = Date.now();
    const ageMs = now - timestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 14) {
      return "recent";     // In database, ultra-fast
    } else if (ageDays <= 30) {
      return "cached";     // Still in database, fast
    } else {
      return "archived";   // In ThingSpeak, slower
    }
  }

  /**
   * Check if data should be fetched from database or ThingSpeak
   */
  static shouldFetchFromDatabase(startDate, endDate) {
    const now = new Date();
    const policy = this.getRetentionPolicy();

    // Convert dates to day offsets
    const startDaysAgo = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const endDaysAgo = Math.floor((now - endDate) / (1000 * 60 * 60 * 24));

    // If all data is within keep window, use database
    const allRecent = startDaysAgo <= policy.keepDays;
    // If mostly within keep window, still use database
    const mostlyRecent = startDaysAgo <= policy.keepDays + 7;

    return allRecent || mostlyRecent;
  }

  /**
   * Get telemetry data count in database
   * Useful for monitoring
   */
  static async getTelemetryStatistics(deviceId) {
    try {
      const thresholds = this.calculateDateThresholds();
      const telemetryRef = db.collection("devices").doc(deviceId).collection("telemetry");

      // Count recent (< 14 days)
      const recentQuery = telemetryRef.where(
        "timestamp",
        ">=",
        admin.firestore.Timestamp.fromDate(thresholds.keepUntilDate)
      );
      const recentCount = (await recentQuery.count().get()).data().count;

      // Count archived (> 30 days)
      const archivedQuery = telemetryRef.where(
        "timestamp",
        "<",
        admin.firestore.Timestamp.fromDate(thresholds.archiveAfterDate)
      );
      const archivedCount = (await archivedQuery.count().get()).data().count;

      // Total count
      const totalCount = (await telemetryRef.count().get()).data().count;

      return {
        total: totalCount,
        recent: recentCount,
        archived: archivedCount,
        cachedToDelete: totalCount - recentCount,
        policy: this.getRetentionPolicy(),
      };
    } catch (error) {
      logger.error(`Error getting telemetry stats for ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Estimate database size
   */
  static async estimateDatabaseSize() {
    try {
      const devicesSnapshot = await db.collection("devices").get();
      let totalDocuments = 0;
      let totalEstimatedSize = 0; // in KB

      for (const deviceDoc of devicesSnapshot.docs) {
        const stats = await this.getTelemetryStatistics(deviceDoc.id);
        if (stats) {
          totalDocuments += stats.total;
          // Rough estimate: ~500 bytes per telemetry document
          totalEstimatedSize += (stats.total * 500) / 1024;
        }
      }

      return {
        totalDocuments,
        estimatedSizeKB: Math.round(totalEstimatedSize),
        estimatedSizeMB: Math.round(totalEstimatedSize / 1024),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error estimating database size:", error);
      return null;
    }
  }

  /**
   * Log cleanup statistics
   */
  static async logCleanupStats() {
    try {
      const stats = await this.estimateDatabaseSize();
      if (stats) {
        logger.info("📊 Database Statistics:", {
          totalDocuments: stats.totalDocuments,
          estimatedSize: `${stats.estimatedSizeMB}MB`,
          timestamp: stats.timestamp,
        });
      }
    } catch (error) {
      logger.error("Error logging cleanup stats:", error);
    }
  }
}

module.exports = TelemetryArchiveService;
