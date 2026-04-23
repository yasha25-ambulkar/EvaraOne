/**
 * Hybrid Data Resolver
 * 
 * Smart logic to decide:
 * - Fetch from local Firestore database (fast, recent data)
 * - Fetch from ThingSpeak API (slower, historical data)
 * - Use cache when available
 */

const TelemetryArchiveService = require("../services/telemetryArchiveService");
const admin = require("firebase-admin");
const axios = require("axios");
const logger = require("../utils/logger");

const db = admin.firestore();

class HybridDataResolver {
  /**
   * Main resolver: Decide where to fetch data from
   */
  static async resolveAndFetchTelemetry(deviceId, startDate, endDate, options = {}) {
    try {
      logger.debug(`🔍 Resolving telemetry for ${deviceId} from ${startDate} to ${endDate}`);

      // Get device config
      const deviceDoc = await db.collection("devices").doc(deviceId).get();
      if (!deviceDoc.exists) {
        throw new Error(`Device ${deviceId} not found`);
      }

      const device = deviceDoc.data();
      const dataSource = this.determineDataSource(startDate, endDate);

      logger.debug(`📍 Data source: ${dataSource}`);

      let telemetryData = [];

      if (dataSource === "database") {
        // Fetch from Firestore (fast)
        telemetryData = await this.fetchFromDatabase(deviceId, startDate, endDate, options);
        logger.info(`✅ Fetched ${telemetryData.length} records from DATABASE`);
      } else if (dataSource === "thingspeak") {
        // Fetch from ThingSpeak (slower but complete)
        telemetryData = await this.fetchFromThingSpeak(device, startDate, endDate, options);
        logger.info(`✅ Fetched ${telemetryData.length} records from THINGSPEAK`);
      } else if (dataSource === "hybrid") {
        // Fetch recent from database + old from ThingSpeak
        const recentData = await this.fetchFromDatabase(deviceId, startDate, endDate, options);
        const oldData = await this.fetchFromThingSpeak(device, startDate, endDate, options);

        // Merge and deduplicate
        telemetryData = this.mergeAndDeduplicate(recentData, oldData);
        logger.info(`✅ Fetched HYBRID: ${recentData.length} from DB + ${oldData.length} from ThingSpeak`);
      }

      return {
        success: true,
        data: telemetryData,
        source: dataSource,
        count: telemetryData.length,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`❌ Error resolving telemetry:`, error.message);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * Determine which data source to use
   * Returns: "database", "thingspeak", or "hybrid"
   */
  static determineDataSource(startDate, endDate) {
    const now = new Date();
    const policy = TelemetryArchiveService.getRetentionPolicy();

    const startDaysAgo = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const endDaysAgo = Math.floor((now - endDate) / (1000 * 60 * 60 * 24));

    logger.debug(`📊 Date analysis: startDaysAgo=${startDaysAgo}, endDaysAgo=${endDaysAgo}, keepDays=${policy.keepDays}`);

    // All data is within 14-day window → Use database (fastest)
    if (startDaysAgo <= policy.keepDays) {
      return "database";
    }

    // All data is older than 30 days → Use ThingSpeak (will be deleted from DB)
    if (endDaysAgo > policy.archiveAfterDays) {
      return "thingspeak";
    }

    // Data spans across boundary → Use hybrid (both sources)
    return "hybrid";
  }

  /**
   * Fetch telemetry from Firestore database
   * Fast access for recent data
   */
  static async fetchFromDatabase(deviceId, startDate, endDate, options = {}) {
    try {
      const telemetryRef = db
        .collection("devices")
        .doc(deviceId)
        .collection("telemetry");

      let query = telemetryRef
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startDate))
        .where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endDate));

      // Optional: limit results
      if (options.limit) {
        query = query.limit(options.limit);
      }

      // Optional: order by timestamp
      const orderBy = options.orderBy || "timestamp";
      const direction = options.direction || "asc";
      query = query.orderBy(orderBy, direction);

      const snapshot = await query.get();

      const data = [];
      snapshot.forEach((doc) => {
        data.push({
          ...doc.data(),
          _id: doc.id,
          _source: "database",
        });
      });

      logger.debug(`📦 Database query returned ${data.length} records`);
      return data;
    } catch (error) {
      logger.error("❌ Database fetch error:", error.message);
      return [];
    }
  }

  /**
   * Fetch telemetry from ThingSpeak API
   * Slower but has historical data
   */
  static async fetchFromThingSpeak(device, startDate, endDate, options = {}) {
    try {
      const channelId = device.thingspeak_channel_id;
      const readApiKey = device.thingspeak_read_api_key;

      if (!channelId || !readApiKey) {
        logger.warn("⚠️ ThingSpeak credentials missing for device");
        return [];
      }

      logger.debug(`🔄 Fetching from ThingSpeak channel ${channelId}`);

      const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json`;

      const params = {
        api_key: readApiKey,
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
        results: options.limit || 8000, // ThingSpeak limit is 8000
        timezone: "Asia/Kolkata",
      };

      const response = await axios.get(url, { params, timeout: 10000 });

      if (!response.data.feeds) {
        logger.warn("⚠️ No feeds in ThingSpeak response");
        return [];
      }

      const data = response.data.feeds.map((feed) => ({
        ...feed,
        timestamp: new Date(feed.created_at),
        _id: `ts-${feed.id}`,
        _source: "thingspeak",
      }));

      logger.debug(`✅ ThingSpeak returned ${data.length} records`);
      return data;
    } catch (error) {
      logger.error("❌ ThingSpeak fetch error:", error.message);
      return [];
    }
  }

  /**
   * Merge data from multiple sources and remove duplicates
   */
  static mergeAndDeduplicate(databaseData, thingspeakData) {
    const merged = [...databaseData, ...thingspeakData];
    const deduped = [];
    const seen = new Set();

    // Sort by timestamp
    merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (const record of merged) {
      const key = `${record.timestamp}`;
      if (!seen.has(key)) {
        deduped.push(record);
        seen.add(key);
      }
    }

    logger.debug(`🔄 Merged ${databaseData.length} + ${thingspeakData.length} = ${deduped.length} deduplicated records`);
    return deduped;
  }

  /**
   * Get data age category with metadata
   */
  static analyzeDataAge(startDate, endDate) {
    const now = new Date();
    const startDaysAgo = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const endDaysAgo = Math.floor((now - endDate) / (1000 * 60 * 60 * 24));

    let category = "recent";
    let expectedLatency = "< 500ms";

    if (startDaysAgo > 30) {
      category = "archived";
      expectedLatency = "1-2 seconds";
    } else if (startDaysAgo > 14) {
      category = "cached";
      expectedLatency = "500-800ms";
    }

    return {
      startDaysAgo,
      endDaysAgo,
      category,
      expectedLatency,
      fetchLocation: category === "recent" ? "Database" : "ThingSpeak",
    };
  }

  /**
   * Optimize query for performance
   */
  static optimizeQuery(startDate, endDate) {
    const rangeMs = endDate - startDate;
    const rangeDays = rangeMs / (1000 * 60 * 60 * 24);

    let optimization = {
      recommended: [],
      limit: null,
      sampling: null,
    };

    if (rangeDays <= 7) {
      optimization.recommended.push("No sampling needed");
      optimization.limit = 8000;
    } else if (rangeDays <= 30) {
      optimization.recommended.push("Consider sampling");
      optimization.sampling = "Aggregate to hourly";
      optimization.limit = 720; // 30 days * 24 hours
    } else if (rangeDays <= 90) {
      optimization.recommended.push("Strong sampling recommended");
      optimization.sampling = "Aggregate to 6-hourly";
      optimization.limit = 360; // 90 days / 6 hours
    } else {
      optimization.recommended.push("Heavy sampling required");
      optimization.sampling = "Aggregate to daily";
      optimization.limit = 90;
    }

    return optimization;
  }

  /**
   * Prefetch data for common time ranges
   * Called on device creation or schedule
   */
  static async prefetchCommonRanges(deviceId) {
    try {
      const now = new Date();
      const ranges = [
        {
          name: "last7days",
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now,
        },
        {
          name: "last30days",
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now,
        },
      ];

      for (const range of ranges) {
        await this.resolveAndFetchTelemetry(deviceId, range.start, range.end);
        logger.info(`✅ Prefetched ${range.name} for device ${deviceId}`);
      }

      return { success: true, message: "Prefetch complete" };
    } catch (error) {
      logger.error("❌ Prefetch error:", error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = HybridDataResolver;
