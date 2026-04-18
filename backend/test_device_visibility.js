/**
 * PHASE 2 CRITICAL FIX: COMPREHENSIVE DEVICE VISIBILITY TEST
 * 
 * Test all device endpoints to ensure they REJECT hidden devices with 403
 * and ACCEPT visible devices with 200
 * 
 * This test verifies the multi-tenant data isolation fix:
 * - Hidden devices (isVisibleToCustomer: false) should not be accessible
 * - Every device endpoint enforces visibility check
 * - Superadmins can bypass visibility checks
 * 
 * Usage: node test_device_visibility.js
 */

const axios = require("axios");
const { admin, db } = require("./src/config/firebase.js");

const BASE_URL = process.env.API_BASE_URL || "http://localhost:5000/api/v1";
const TEST_CUSTOMER_ID = "test_customer_001";
const TEST_USER_UID = "test_user_001";
const TEST_DEVICE_ID = "device_visibility_test_001";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

let passCount = 0;
let failCount = 0;
let testResults = [];

/**
 * Test result logger
 */
function logResult(testName, passed, details = "") {
  const status = passed
    ? `${colors.green}✅ PASS${colors.reset}`
    : `${colors.red}❌ FAIL${colors.reset}`;
  testResults.push({ testName, passed });
  passCount += passed ? 1 : 0;
  failCount += passed ? 0 : 1;

  console.log(`${status} | ${testName}`);
  if (details) {
    console.log(`   └─ ${details}`);
  }
}

/**
 * Create a mock Firebase JWT token for testing
 */
async function generateTestToken(uid, role = "customer", customerEmail = null) {
  try {
    console.log(`\n📋 Generating token for user ${uid} with role ${role}...`);
    // In a real test, you'd use firebase admin SDK to create a custom token
    // For now, we'll create a simple JWT token structure

    const token = await admin.auth().createCustomToken(uid, {
      role,
      customer_id: TEST_CUSTOMER_ID,
      email: customerEmail || `${uid}@test.com`,
    });

    return token;
  } catch (error) {
    console.error(`❌ Token generation failed:`, error.message);
    throw error;
  }
}

/**
 * Create test devices in Firestore
 * - visibleDevice: isVisibleToCustomer = true
 * - hiddenDevice: isVisibleToCustomer = false (should be rejected)
 */
async function setupTestDevices() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}SETUP: Creating test devices${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);

  try {
    // Create visible device
    await db.collection("devices").doc("visible_device_test").set({
      device_id: "visible_device_test",
      customer_id: TEST_CUSTOMER_ID,
      device_type: "evaratank",
      label: "Visible Tank Device",
      isVisibleToCustomer: true, // ✅ VISIBLE
      status: "ONLINE",
      created_at: new Date(),
    });
    console.log("✅ Created visible device: visible_device_test");

    // Create hidden device
    await db.collection("devices").doc("hidden_device_test").set({
      device_id: "hidden_device_test",
      customer_id: TEST_CUSTOMER_ID,
      device_type: "evaratank",
      label: "Hidden Tank Device",
      isVisibleToCustomer: false, // ❌ HIDDEN
      status: "ONLINE",
      created_at: new Date(),
    });
    console.log("✅ Created hidden device: hidden_device_test");

    // Create device metadata for both
    await db.collection("evaratank").doc("visible_device_test").set({
      device_id: "visible_device_test",
      customer_id: TEST_CUSTOMER_ID,
      label: "Visible Tank Device",
      thingspeak_channel_id: "12345",
      thingspeak_read_api_key: "test_key_123",
      last_updated_at: new Date(),
      last_value: 120,
      isVisibleToCustomer: true,
    });
    console.log("✅ Created visible device metadata");

    await db.collection("evaratank").doc("hidden_device_test").set({
      device_id: "hidden_device_test",
      customer_id: TEST_CUSTOMER_ID,
      label: "Hidden Tank Device",
      thingspeak_channel_id: "12345",
      thingspeak_read_api_key: "test_key_123",
      last_updated_at: new Date(),
      last_value: 120,
      isVisibleToCustomer: false,
    });
    console.log("✅ Created hidden device metadata");

    // Create TDS device variants
    await db.collection("devices").doc("visible_tds_test").set({
      device_id: "visible_tds_test",
      customer_id: TEST_CUSTOMER_ID,
      device_type: "evaratds",
      label: "Visible TDS Device",
      isVisibleToCustomer: true,
      status: "ONLINE",
      created_at: new Date(),
    });

    await db.collection("evaratds").doc("visible_tds_test").set({
      device_id: "visible_tds_test",
      customer_id: TEST_CUSTOMER_ID,
      label: "Visible TDS Device",
      thingspeak_channel_id: "12346",
      thingspeak_read_api_key: "test_key_456",
      last_updated_at: new Date(),
      sensor_field_mapping: { field1: "tds_value", field2: "temperature" },
      isVisibleToCustomer: true,
    });
    console.log("✅ Created visible TDS device");

    await db.collection("devices").doc("hidden_tds_test").set({
      device_id: "hidden_tds_test",
      customer_id: TEST_CUSTOMER_ID,
      device_type: "evaratds",
      label: "Hidden TDS Device",
      isVisibleToCustomer: false,
      status: "ONLINE",
      created_at: new Date(),
    });

    await db.collection("evaratds").doc("hidden_tds_test").set({
      device_id: "hidden_tds_test",
      customer_id: TEST_CUSTOMER_ID,
      label: "Hidden TDS Device",
      thingspeak_channel_id: "12346",
      thingspeak_read_api_key: "test_key_456",
      last_updated_at: new Date(),
      sensor_field_mapping: { field1: "tds_value", field2: "temperature" },
      isVisibleToCustomer: false,
    });
    console.log("✅ Created hidden TDS device");
  } catch (error) {
    console.error(`❌ Setup failed:`, error.message);
    throw error;
  }
}

/**
 * TEST SUITE: Device Visibility Enforcement
 */
async function runVisibilityTests() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}TEST SUITE: DEVICE VISIBILITY ENFORCEMENT${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);

  try {
    // Get test tokens
    const customerToken = await generateTestToken(TEST_USER_UID, "customer");
    const superadminUid = "test_superadmin_001";
    const superadminToken = await generateTestToken(superadminUid, "superadmin");

    const defaultHeaders = (token) => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });

    // ─────────────────────────────────────────────────────────────────────
    // TEST 1: GET /devices (getNodes) - Visible device should appear
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 1] GET /devices - Visible device should appear${colors.reset}`
    );
    try {
      const response = await axios.get(`${BASE_URL}/devices`, {
        headers: defaultHeaders(customerToken),
      });
      const hasVisibleDevice = response.data.some(
        (d) => d.id === "visible_device_test"
      );
      const hasHiddenDevice = response.data.some(
        (d) => d.id === "hidden_device_test"
      );
      logResult(
        "Visible device appears in list",
        hasVisibleDevice,
        `Found ${response.data.length} devices`
      );
      logResult(
        "Hidden device NOT in list",
        !hasHiddenDevice,
        "Hidden device properly filtered"
      );
    } catch (error) {
      logResult("GET /devices", false, error.response?.data?.error || error.message);
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 2: GET /devices/:id - Hidden device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 2] GET /devices/:id - Hidden device should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/hidden_device_test`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden device returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden device returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 3: GET /devices/:id/telemetry - Hidden device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 3] GET /devices/:id/telemetry - Hidden device should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/hidden_device_test/telemetry`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden device telemetry returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden device telemetry returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 4: GET /devices/tds/:id/telemetry - Hidden TDS device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 4] GET /devices/tds/:id/telemetry - Hidden TDS should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/tds/hidden_tds_test/telemetry`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden TDS telemetry returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden TDS telemetry returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 5: GET /devices/tds/:id/config - Hidden TDS device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 5] GET /devices/tds/:id/config - Hidden TDS should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/tds/hidden_tds_test/config`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden TDS config returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden TDS config returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 6: GET /devices/tds/:id/history - Hidden TDS device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 6] GET /devices/tds/:id/history - Hidden TDS should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/tds/hidden_tds_test/history`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden TDS history returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden TDS history returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 7: GET /devices/tds/:id/analytics - Hidden TDS device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 7] GET /devices/tds/:id/analytics - Hidden TDS should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/tds/hidden_tds_test/analytics`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden TDS analytics returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden TDS analytics returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 8: GET /devices/:id/graph - Hidden device should return 403
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 8] GET /devices/:id/graph - Hidden device should return 403${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/hidden_device_test/graph`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Hidden device graph returns 403",
        response.status === 403,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Hidden device graph returns 403",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 9: Superadmin CAN access hidden devices
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 9] Superadmin can access hidden devices${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/hidden_device_test`,
        {
          headers: defaultHeaders(superadminToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Superadmin can access hidden device",
        response.status === 200,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Superadmin can access hidden device",
        false,
        error.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 10: Customer CAN access visible devices
    // ─────────────────────────────────────────────────────────────────────
    console.log(
      `\n${colors.yellow}[TEST 10] Customer can access visible devices${colors.reset}`
    );
    try {
      const response = await axios.get(
        `${BASE_URL}/devices/visible_device_test`,
        {
          headers: defaultHeaders(customerToken),
          validateStatus: () => true,
        }
      );
      logResult(
        "Customer can access visible device",
        response.status === 200,
        `Status: ${response.status}`
      );
    } catch (error) {
      logResult(
        "Customer can access visible device",
        false,
        error.message
      );
    }

  } catch (error) {
    console.error(`\n❌ Test suite failed:`, error.message);
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}CLEANUP: Removing test data${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);

  try {
    // Delete test devices
    const testDevices = [
      "visible_device_test",
      "hidden_device_test",
      "visible_tds_test",
      "hidden_tds_test",
    ];

    for (const deviceId of testDevices) {
      await db.collection("devices").doc(deviceId).delete().catch(() => {});
      await db.collection("evaratank").doc(deviceId).delete().catch(() => {});
      await db.collection("evaratds").doc(deviceId).delete().catch(() => {});
    }
    console.log("✅ Cleaned up test data");
  } catch (error) {
    console.error(`⚠️ Cleanup warning:`, error.message);
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);

  console.log(`\n${colors.green}Passed: ${passCount}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failCount}${colors.reset}`);
  console.log(`Total: ${passCount + failCount}`);

  if (failCount === 0) {
    console.log(`\n${colors.green}🎉 ALL TESTS PASSED! Device visibility enforcement is working correctly.${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Some tests failed. Review the failures above.${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function main() {
  try {
    console.log(`\n${colors.blue}${"═".repeat(50)}${colors.reset}`);
    console.log(`${colors.blue}PHASE 2 CRITICAL FIX: DEVICE VISIBILITY TEST${colors.reset}`);
    console.log(`${colors.blue}${"═".repeat(50)}${colors.reset}`);

    await setupTestDevices();
    await runVisibilityTests();
    await cleanup();
    printSummary();
  } catch (error) {
    console.error(`\n${colors.red}❌ Test runner failed:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run tests
main();
