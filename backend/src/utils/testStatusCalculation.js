/**
 * testStatusCalculation.js
 * 
 * Test script to validate strict date + time based status calculation
 * Run with: node backend/src/utils/testStatusCalculation.js
 */

const calculateDeviceStatus = (lastUpdatedAt) => {
  const OFFLINE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
  
  if (!lastUpdatedAt) return "OFFLINE";
  
  try {
    const now = new Date();
    const lastUpdate = new Date(lastUpdatedAt);
    
    // Convert to local timezone (IST for India)
    const tzOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const nowLocal = new Date(now.getTime() + tzOffset);
    const lastUpdateLocal = new Date(lastUpdate.getTime() + tzOffset);
    
    // Extract date components (YYYY-MM-DD)
    const currentDate = nowLocal.toISOString().split('T')[0];
    const lastDataDate = lastUpdateLocal.toISOString().split('T')[0];
    
    logger.debug(`  Current datetime: ${nowLocal.toISOString()} (${currentDate})`);
    logger.debug(`  Last data datetime: ${lastUpdateLocal.toISOString()} (${lastDataDate})`);
    
    // CONDITION 1: Check if same day
    if (lastDataDate !== currentDate) {
      logger.debug(`  ❌ Different dates detected: "${lastDataDate}" vs "${currentDate}"`);
      return "OFFLINE";
    }
    
    // CONDITION 2: Check time difference (must be <= 20 minutes)
    const timeDiffMs = nowLocal.getTime() - lastUpdateLocal.getTime();
    const timeDiffMinutes = timeDiffMs / (1000 * 60); // Use exact value, not rounded
    
    logger.debug(`  Time difference: ${timeDiffMinutes.toFixed(2)} minutes (${timeDiffMs}ms)`);
    
    if (timeDiffMinutes <= 20) {
      logger.debug(`  ✅ Within 20 minute threshold`);
      return "ONLINE";
    } else {
      logger.debug(`  ❌ Exceeds 20 minute threshold`);
      return "OFFLINE";
    }
  } catch (err) {
    logger.error("  Error:", err.message);
    return "OFFLINE";
  }
};

// Test cases
logger.debug("=".repeat(80));
logger.debug("TEST CASE 1: Data from 10 minutes ago (today)");
logger.debug("Expected: ONLINE");
const test1 = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
const result1 = calculateDeviceStatus(test1);
logger.debug(`Result: ${result1}`);
logger.debug(result1 === "ONLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));

logger.debug("\nTEST CASE 2: Data from 25 minutes ago (today)");
logger.debug("Expected: OFFLINE");
const test2 = new Date(Date.now() - (25 * 60 * 1000)).toISOString();
const result2 = calculateDeviceStatus(test2);
logger.debug(`Result: ${result2}`);
logger.debug(result2 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));

logger.debug("\nTEST CASE 3: Data from yesterday");
logger.debug("Expected: OFFLINE");
const test3 = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
const result3 = calculateDeviceStatus(test3);
logger.debug(`Result: ${result3}`);
logger.debug(result3 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));

logger.debug("\nTEST CASE 4: No data (null)");
logger.debug("Expected: OFFLINE");
const result4 = calculateDeviceStatus(null);
logger.debug(`Result: ${result4}`);
logger.debug(result4 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));

logger.debug("\nTEST CASE 5: Data from exactly 20 minutes ago");
logger.debug("Expected: ONLINE");
const test5 = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
const result5 = calculateDeviceStatus(test5);
logger.debug(`Result: ${result5}`);
logger.debug(result5 === "ONLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));

logger.debug("\nTEST CASE 6: Data from 20 minutes 1 second ago");
logger.debug("Expected: OFFLINE");
const test6 = new Date(Date.now() - (20 * 60 * 1000) - 1000).toISOString();
const result6 = calculateDeviceStatus(test6);
logger.debug(`Result: ${result6}`);
logger.debug(result6 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
logger.debug("=".repeat(80));
