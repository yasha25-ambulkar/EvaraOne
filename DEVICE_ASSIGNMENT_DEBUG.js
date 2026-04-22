// Debug script to verify device assignment flow
// Run this in browser console on AllNodes page to check:
// 1. Is customer_id present in device objects?
// 2. Is customer_name present in device objects?
// 3. Are devices properly filtered by customer?

console.log("=== DEVICE ASSIGNMENT VERIFICATION ===\n");

// Get the nodes from React Query cache or component state
// This assumes the useNodes hook is active
const params = new URLSearchParams(window.location.search);
const devTools = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

// Method 1: Check Network tab for /nodes API response
console.log("📊 STEP 1: Check API Response");
console.log("Go to Network tab → Filter 'nodes' → Check Response body");
console.log("Expected: Each device should have:");
console.log("  ✓ customer_id: '<customer_id>'");
console.log("  ✓ customer_name: '<customer_name>'");
console.log("");

// Method 2: Check React component state
console.log("📊 STEP 2: Check Frontend State");
console.log("If you have React DevTools:");
console.log("  1. Go to Components tab");
console.log("  2. Find 'AllNodes' component");
console.log("  3. Check 'nodes' prop/state");
console.log("  4. Each device should show customer_id and customer_name");
console.log("");

// Method 3: Direct console check
console.log("📊 STEP 3: Manual Console Check");
console.log("If nodes are available globally, run:");
console.log("  console.table(nodes.map(n => ({");
console.log("    id: n.id,");
console.log("    label: n.label,");
console.log("    customer_id: n.customer_id,");
console.log("    customer_name: n.customer_name");
console.log("  })))");
console.log("");

// Method 4: Check individual device in DevTools
console.log("📊 STEP 4: Firestore Check");
console.log("In Firebase Console:");
console.log("  1. Go to Firestore Database");
console.log("  2. Open 'devices' collection");
console.log("  3. Click on a device document");
console.log("  4. Check: customer_id field should have a value");
console.log("");

// Method 5: Test data flow
console.log("📊 STEP 5: Test Flow");
console.log("Scenario: Assign a device to customer 'Ritik'");
console.log("Expected results:");
console.log("  ✓ Firestore 'devices' collection → device.customer_id = 'ritik_id'");
console.log("  ✓ Firestore '[device_type]' collection → device.customer_id = 'ritik_id'");
console.log("  ✓ GET /nodes API → returns device with customer_id and customer_name");
console.log("  ✓ UI shows customer name in device card");
console.log("");

console.log("=== COMMON ISSUES ===");
console.log("❌ Issue 1: customer_id not set in Firestore");
console.log("   → Check updateNode endpoint is being called");
console.log("   → Verify updateNode is updating both 'devices' and '[type]' collections");
console.log("");
console.log("❌ Issue 2: customer_name is null even though customer_id is set");
console.log("   → Check if customerMap is being built correctly in getNodes");
console.log("   → Check if customers collection has 'name' field");
console.log("");
console.log("❌ Issue 3: API not returning customer fields");
console.log("   → Check nodes.controller.js line 324");
console.log("   → Verify customer_id and customer_name in nodeData object");
console.log("");
console.log("❌ Issue 4: UI not showing customer information");
console.log("   → Check if customer_id/customer_name props exist on device objects");
console.log("   → Add customer info display in AllNodes card if not present");
