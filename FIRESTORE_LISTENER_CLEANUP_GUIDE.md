/**
 * Firestore Listener Cleanup Guide
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * This guide shows how to properly set up and clean up Firestore onSnapshot
 * listeners to prevent memory leaks in production.
 * 
 * PROBLEM: Without cleanup, listeners accumulate unbounded with each socket
 * connection. After 1000+ connections, the Node.js process OOM-crashes.
 * 
 * SOLUTION: Use the listener management infrastructure:
 * - Socket.io: registerListener() + socket.on('disconnect')
 * - Workers: registerFirestoreListener() + SIGTERM handler
 */

// ═════════════════════════════════════════════════════════════════════════════
// SOCKET.IO EXAMPLE: Real-time Device Updates
// ═════════════════════════════════════════════════════════════════════════════

const { db } = require('./config/firebase.js');

// This function would be called from a socket event handler
function setupDeviceListener(socket, deviceId) {
  // ⚠️ IMPORTANT: Verify ownership before subscribing
  // (This should be done in middleware or before this function)
  
  // Set up the Firestore listener
  const unsubscribe = db.collection('evaratds').doc(deviceId).onSnapshot(
    (doc) => {
      // Listener is live and receiving updates
      const deviceData = doc.data();
      
      // Emit to client via Socket.io
      socket.emit('device:update', {
        id: doc.id,
        data: deviceData,
        timestamp: new Date()
      });
    },
    (error) => {
      // Handle errors (e.g., permission denied, network error)
      logger.error('[Socket.io] Listener error', { deviceId, error: error.message });
      socket.emit('error', { message: 'Failed to subscribe to device updates' });
    }
  );
  
  // ✅ CRITICAL: Register the unsubscribe function
  // It will be called automatically when socket disconnects
  registerListener(socket.id, unsubscribe);
  
  logger.debug('[Socket.io] Device listener registered', { socketId: socket.id, deviceId });
}

// Usage in a socket.io event handler:
// 
// socket.on('subscribe_device_live', async (deviceId) => {
//   try {
//     // Verify ownership (existing middleware)
//     const isOwner = await checkOwnership(...);
//     if (!isOwner) return socket.emit('error', { message: 'Unauthorized' });
//     
//     // Set up listener - cleanup is automatic on disconnect
//     setupDeviceListener(socket, deviceId);
//   } catch (err) {
//     logger.error('[Socket.io] Subscribe failed', err);
//     socket.emit('error', { message: err.message });
//   }
// });

// ═════════════════════════════════════════════════════════════════════════════
// MULTIPLE LISTENERS PER SOCKET: Example
// ═════════════════════════════════════════════════════════════════════════════

// A socket can have multiple listeners (e.g., multiple devices subscribed)
// The system handles this automatically - it stores them all and cleans all up

function setupMultipleDeviceListeners(socket, deviceIds) {
  for (const deviceId of deviceIds) {
    const unsubscribe = db.collection('evaratds').doc(deviceId).onSnapshot(
      (doc) => {
        socket.emit('device:update', { id: doc.id, data: doc.data() });
      }
    );
    
    // ✅ Each listener is registered separately
    // On disconnect, ALL will be cleaned up
    registerListener(socket.id, unsubscribe);
  }
  
  logger.debug('[Socket.io] Multiple device listeners registered', {
    socketId: socket.id,
    deviceCount: deviceIds.length
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// WORKER PROCESS EXAMPLE: Telemetry Stream
// ═════════════════════════════════════════════════════════════════════════════

// In backend/src/workers/telemetryWorker.js:
//
// const { registerFirestoreListener } = require('./telemetryWorker');
// 
// async function startRealtimeUpdates() {
//   // Set up listener for all active devices
//   const unsubscribe = db.collection('devices')
//     .where('status', '==', 'ACTIVE')
//     .onSnapshot(
//       (snapshot) => {
//         snapshot.docChanges().forEach((change) => {
//           if (change.type === 'added' || change.type === 'modified') {
//             processDeviceUpdate(change.doc.data());
//           }
//         });
//       },
//       (error) => {
//         logger.error('[TelemetryWorker] Listener error', { error: error.message });
//       }
//     );
//   
//   // ✅ Register for cleanup on SIGTERM (graceful shutdown)
//   registerFirestoreListener(unsubscribe);
//   logger.info('[TelemetryWorker] Listener registered for graceful shutdown');
// }

// ═════════════════════════════════════════════════════════════════════════════
// MEMORY LEAK PREVENTION CHECKLIST
// ═════════════════════════════════════════════════════════════════════════════

/*
  ✅ DO:
  1. Always store the unsubscribe function returned by onSnapshot()
  2. Call registerListener() for socket.io handlers
  3. Call registerFirestoreListener() for workers
  4. Test cleanup with debug logging: "Listener cleaned up" message
  5. Verify listener count goes to 0 after all clients disconnect
  
  ❌ DON'T:
  1. Ignore the return value of onSnapshot()
  2. Set up listeners without registering them
  3. Forget to clean up in disconnect handlers
  4. Create global listeners without shutdown handlers
  5. Deploy without testing listener cleanup
*/

// ═════════════════════════════════════════════════════════════════════════════
// TESTING: Verify Listeners Are Cleaned Up
// ═════════════════════════════════════════════════════════════════════════════

/*
  Test Steps:
  
  1. Start the backend server
  
  2. Connect a Socket.io client and subscribe to a device:
     socket.emit('subscribe_device_live', 'device-id-123');
  
  3. Check logs for:
     "[Socket.io] Device listener registered" + socketId
     "[Firestore] Listener cleaned up" (should NOT appear yet)
  
  4. Disconnect the socket / browser tab
  
  5. Check logs for:
     "[Firestore] Listeners cleaned up" with count > 0
     Verify no error messages
  
  6. Reconnect multiple times and verify step 5 repeats
  
  7. Monitor memory usage:
     - Should stabilize after disconnect
     - Should NOT grow unbounded
     - RSS (resident set size) should not increase on reconnects
  
  Failure Signs:
  - Memory keeps growing after disconnects
  - "[Firestore] Listeners cleaned up" message never appears
  - Number of Firestore operations increases indefinitely
*/

// ═════════════════════════════════════════════════════════════════════════════
// ARCHITECTURAL OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════

/*
  Socket.io Connection Lifecycle:
  
  1. Client connects → socket.id assigned
  2. Socket middleware runs → connection counter incremented
  3. Client emits 'subscribe_device' → listener registered in firestoreListeners Map
  4. Updates stream via onSnapshot callback → socket.emit() to client
  5. Client disconnects → disconnect event fires
  6. Handler calls cleanupListeners(socket.id)
  7. All listeners for that socket are unsubscribed
  8. Entry removed from firestoreListeners Map
  
  Worker Process Lifecycle:
  
  1. Worker starts → setupGracefulShutdown() installed
  2. Listeners set up → registerFirestoreListener() called
  3. Node receives SIGTERM signal (graceful shutdown)
  4. shutdownHandler runs → all listeners unsubscribed
  5. firestoreListeners array cleared
  6. process.exit(0)
*/
