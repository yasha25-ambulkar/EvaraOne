# Async Error Handling in Workers & Background Jobs

**CRITICAL FIX**: Prevents unhandled promise rejections from silently crashing worker threads

## Problem

Unhandled promise rejections in background workers and cron jobs cause **silent failures**:
- Worker thread crashes without error logs
- No alert to monitoring systems
- Service becomes unresponsive
- Users experience outages without visibility

### Root Causes Fixed

1. **Missing error handlers in setInterval callbacks**
   - `setInterval(asyncFunction)` doesn't catch promise rejections
   - Rejection silently crashes the worker
   
2. **Firestore listener disconnections unhandled**
   - `onSnapshot()` without error callback drops Firestore errors
   - Network issues cause silent failure
   
3. **Async forEach operations without try/catch**
   - Errors inside snapshot.forEach callbacks propagate uncaught
   - Single outer try/catch doesn't catch async inner errors

4. **Global process-level rejections not logged with context**
   - Unhandled rejections weren't being tracked with enough detail
   - Stack traces and error context were missing

## Solutions Implemented

### 1. TelemetryWorker - Error-Safe Polling Loop

**File**: `backend/src/workers/telemetryWorker.js`

**Before** (DANGEROUS):
```javascript
function startWorker() {
  // ❌ If runPoll throws, it crashes silently
  runPoll();
  
  // ❌ If runPoll rejects, worker dies with no error logged
  setInterval(runPoll, POLL_INTERVAL);
}
```

**After** (SAFE):
```javascript
function startWorker() {
  // ✅ Initial poll with error handler
  runPoll().catch(err => {
    logger.error('[TelemetryWorker] Initial poll failed', { 
      error: err.message, 
      category: 'telemetry' 
    });
  });
  
  // ✅ Polling loop wraps callback to catch rejections
  setInterval(() => {
    runPoll().catch(err => {
      logger.error('[TelemetryWorker] Poll cycle failed', { 
        error: err.message, 
        category: 'telemetry' 
      });
    });
  }, POLL_INTERVAL);
  
  startStatusCron();
}
```

**Key Points**:
- `.catch()` on initial `runPoll()` logs errors before continuing
- `setInterval` wraps `runPoll()` call to intercept rejections
- Errors logged with category tag for filtering/alerting
- Worker continues running after each poll failure

### 2. DeviceStatusCron - Error-Safe Scheduled Tasks

**File**: `backend/src/workers/deviceStatusCron.js`

**Before** (DANGEROUS):
```javascript
function startStatusCron() {
  // ✅ Initial call has error handler
  recalculateAllDevicesStatus().catch(err => 
    logger.error('Initial status sweep failed', err, { category: 'cron' })
  );
  
  // ❌ But setInterval callback has NO error handler
  // If recalculateAllDevicesStatus rejects, the job silently stops
  setInterval(recalculateAllDevicesStatus, STATUS_CHECK_INTERVAL);
}
```

**After** (SAFE):
```javascript
function startStatusCron() {
  // ✅ Initial call with error handler
  recalculateAllDevicesStatus().catch(err => 
    logger.error('Initial status sweep failed', err, { category: 'cron' })
  );
  
  // ✅ setInterval callback wraps the promise call
  setInterval(() => {
    recalculateAllDevicesStatus().catch(err => {
      logger.error('[DeviceStatusCron] Status sweep cycle failed', { 
        error: err.message, 
        category: 'cron' 
      });
    });
  }, STATUS_CHECK_INTERVAL);
}
```

**Key Points**:
- Errors in cron cycles are logged and don't stop the job
- Each cycle runs independently with its own error boundary
- Failed cycles don't prevent future cycles from running

### 3. Global Process-Level Rejection Handler

**File**: `backend/src/server.js`

**Before** (INSUFFICIENT):
```javascript
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  // ❌ No structured error details
  // ❌ Stack trace not captured
  // ❌ Error code not recorded
});
```

**After** (COMPREHENSIVE):
```javascript
process.on("unhandledRejection", (reason, promise) => {
  logger.error("[Global] Unhandled Promise Rejection", { 
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise?.toString?.() || 'unknown'
  });
  Sentry.captureException(reason);
});

process.on("uncaughtException", (err) => {
  logger.error("[Global] Uncaught Exception thrown", { 
    message: err.message,
    stack: err.stack,
    code: err.code
  });
  Sentry.captureException(err);
  setTimeout(() => process.exit(1), 2000);
});
```

**Key Points**:
- Structured logging with error details, stack traces, codes
- Extracts message from Error objects vs strings
- Tags with [Global] for alerting/filtering
- Sends to Sentry for distributed error tracking

## How to Add onSnapshot Listeners Safely

When implementing real-time Firestore listeners (e.g., in Socket.io handlers), use this pattern:

### REQUIRED: Error Callback on onSnapshot

```javascript
const unsubscribe = db.collection('devices')
  .where('customer_id', '==', customerId)
  // ✅ FIRST: Success callback - receives snapshot
  .onSnapshot(
    (snapshot) => {
      try {
        snapshot.forEach(doc => {
          // ✅ Process each document
          // Even async operations here must be wrapped in try/catch
          try {
            // async work
            await someAsyncOperation(doc.data());
          } catch (err) {
            logger.error('Error processing document', { error: err.message, docId: doc.id });
          }
        });
      } catch (err) {
        logger.error('Snapshot processing failed', { error: err.message });
      }
    },
    // ✅ SECOND: Error callback - REQUIRED
    // Without this, Firestore connection errors go unhandled
    (err) => {
      logger.error('Firestore listener error', { error: err.message, code: err.code });
      // Optionally: Retry logic or emit error to client
      if (socket) {
        socket.emit('error', { message: 'Real-time data unavailable' });
      }
    }
  );

// ✅ Register for cleanup on disconnect
registerListener(socket.id, unsubscribe);
```

### Pattern: Async forEach with Try/Catch

```javascript
// ❌ WRONG: Single outer try/catch doesn't catch async errors
try {
  snapshot.forEach(async (doc) => {
    await someAsyncWork(doc.data());  // Error not caught!
  });
} catch (err) {
  // ❌ This won't catch errors from the async callback
}

// ✅ CORRECT: Each async callback gets its own try/catch
snapshot.forEach((doc) => {
  // Don't use async here unless you wrap it:
  (async () => {
    try {
      await someAsyncWork(doc.data());
    } catch (err) {
      logger.error('Error processing document', { 
        error: err.message, 
        docId: doc.id 
      });
    }
  })(); // IIFE immediately executes
});

// ✅ BETTER: Use Promise.all with error handling
const promises = snapshot.docs.map(async (doc) => {
  try {
    await someAsyncWork(doc.data());
  } catch (err) {
    logger.error('Error processing document', { 
      error: err.message, 
      docId: doc.id 
    });
  }
});
await Promise.all(promises);
```

## Monitoring & Alerting

### Logs to Watch For

```bash
# Telemetry worker failures
"[TelemetryWorker] Initial poll failed"
"[TelemetryWorker] Poll cycle failed"

# Cron failures
"[DeviceStatusCron] Status sweep cycle failed"

# Global unhandled errors
"[Global] Unhandled Promise Rejection"
"[Global] Uncaught Exception thrown"
```

### Sentry Integration

All unhandled errors are sent to Sentry with:
- Error message and stack trace
- Error code (for system errors)
- Structured context (worker type, category, etc.)
- Full async stack traces

**Alert Examples**:
```yaml
# Alert if Global rejections exceed threshold
- name: "Global Error Rate"
  query: 'level:error AND "[Global]" AND Unhandled'
  threshold: 5  # per 5 minutes
  
# Alert if Telemetry Worker stops
- name: "Telemetry Worker Stopped"
  query: '[TelemetryWorker] Poll cycle failed'
  threshold: 10  # consecutive failures
```

## Testing Error Handling

### Verify Polling Error Handling

```javascript
// In test_worker_error_handling.js
const { startWorker } = require('./backend/src/workers/telemetryWorker.js');

// Mock runPoll to throw error
jest.mock('./backend/src/workers/telemetryWorker.js', () => ({
  startWorker: () => {
    runPoll.mockRejectedValueOnce(new Error('Test failure'));
  }
}));

// Observe: Error logged, worker continues
// Verify: Next setInterval cycle runs normally
```

### Verify Cron Error Handling

```javascript
// Mock status cron to throw
jest.mock('./backend/src/workers/deviceStatusCron.js', () => ({
  recalculateAllDevicesStatus: jest
    .fn()
    .mockRejectedValueOnce(new Error('DB error'))
}));

// Observe: "[DeviceStatusCron] Status sweep cycle failed" logged
// Verify: Next interval runs, not stuck
```

### Test Global Handlers

```javascript
// Simulate unhandled rejection
setTimeout(() => {
  Promise.reject(new Error('Test rejection'));
}, 100);

// Observe: "[Global] Unhandled Promise Rejection" logged
```

## Checklist: Adding New Async Work

When adding new background jobs, async callbacks, or Firestore listeners:

- [ ] Wrap `setInterval(asyncFn, ...)` calls to catch rejections
- [ ] Add error callback to all `onSnapshot()` calls
- [ ] Add try/catch inside each async callback in `forEach`
- [ ] Log errors with structured details (message, stack, code)
- [ ] Use category tags for filtering (e.g., 'telemetry', 'cron')
- [ ] Ensure worker continues after errors (don't exit process)
- [ ] Register Firestore listeners with `registerListener()` for cleanup
- [ ] Test error cases (throw errors in mocked dependencies)

## Architecture Benefits

✅ **Worker Resilience**: Errors don't crash entire worker thread  
✅ **Observable**: Every error logged with context for debugging  
✅ **Alertable**: Sentry integration for distributed monitoring  
✅ **Recoverable**: Workers continue after failures  
✅ **Traceable**: Stack traces preserved for root cause analysis  
✅ **Preventive**: Infrastructure ready for future listeners (socket.io, real-time)  

## Production Deployment Notes

1. **Restart Workers After Deploy**: Ensure old worker processes shut down cleanly
   ```bash
   railway up --detach  # or equivalent for your hosting
   ```

2. **Monitor Sentry Dashboard**: Watch for error spikes after deploy
   
3. **Test Staging Environment**: Run error handling tests before production
   
4. **Verify Alerting**: Confirm Sentry alerts fire for unhandled rejections
