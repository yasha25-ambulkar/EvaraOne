# 09. Backend Documentation

## A. Express 5 Application Structure
The EvaraOne backend is an asynchronous **Express 5** application featuring modern promise resolution, unified error propagation, and real-time Socket.io endpoints:
* **Server Entry Point (`server.js`)**:
  * Configures secure HTTP headers via Helmet.
  * Registers CORS rules to block cross-origin requests.
  * Attaches rate-limiting middleware to protect public authentication routes.
  * Initializes the `http` server and binds the Socket.io real-time engine.
  * Sets up central route mappings under `/api/v1`.
  * Standardizes error processing through a global Express error-handler middleware.

---

## B. Background Worker Pipelines
EvaraOne runs two dedicated background workers using **Node Schedule** and memory loops to keep telemetry caches fresh without overloading database reads:

### 1. Telemetry Polling Worker (`telemetryWorker.js`)
* **Frequency**: Runs on a continuous 60-second loop.
* **Function**:
  1. Retrieves the active device registry from Firestore.
  2. For each device, fetches the latest reading from its mapped ThingSpeak channel.
  3. If a new reading is found:
     * Parses the raw sensor value using the configured **Sensor Field Mapping**.
     * Runs the **Spike Removal Filtering** algorithm to eliminate noise.
     * Computes real-time water metrics (volume, flow rate, time estimates) and stores the result in the backend **Memory Cache**.
     * Updates the `last_seen` and `status` values on the corresponding Firestore document.
     * Broadcasts the updated telemetry snapshot over Socket.io to active dashboard clients.

### 2. Device Status Monitor (`deviceStatusCron.js`)
* **Frequency**: Runs every 10 minutes.
* **Function**:
  * Scans the telemetry cache and active device documents.
  * Identifies any devices that have failed to transmit data for over 60 minutes.
  * Automatically marks these devices as **`OFFLINE`** in both the cache and Firestore, triggering system alerts for administrators.

---

## C. Backend Middleware Architecture
Request lifecycles are governed by a series of specialized middleware layers:

```
[Incoming Request]
       │
       ▼
[rateLimiting] ───► Caps IP requests to prevent DDoS
       │
       ▼
[requireAuth] ────► Extracts Bearer token & validates via Firebase Admin
       │
       ▼
[tenantCheck] ────► Verifies user owns the resource they are querying
       │
       ▼
[rbac] ───────────► Verifies role permissions (Viewer read-only bypass / Admin check)
       │
       ▼
[validate] ───────► Validates body and query types via Zod schema checks
       │
       ▼
[Route Controller]
       │
       ▼
[errorHandler] ───► Logs errors via Pino & returns standard JSON error responses
```

---

## D. Mathematical Calculation Utilities (`tankMath.js`)
Calculations are handled by a dedicated math utility library (`tankMath.js`):
* **`computeCapacity(dims)`**: Returns the maximum volume of a tank in liters based on its physical geometry (rectangular or cylindrical).
* **`computeAllMetrics(distance, dims)`**: Takes the raw sensor distance and returns a combined metrics object containing `waterLevelCm`, `volumeLitres`, and `percentage`.
* **`computeRate(prevVol, currVol, dt)`**: Takes historical volume shifts and time deltas to calculate flow rate in liters per minute (L/min).
* **`removeSpikes(readings)`**: Runs a moving-average filter over a series of readings to discard outlier spikes caused by sensor errors.
