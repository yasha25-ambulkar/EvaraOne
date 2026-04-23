# Backend Codebase Structure - Comprehensive Audit Preparation

**Date:** April 23, 2026  
**Purpose:** Complete code review, security audit, and quality assessment  
**Workspace:** `d:\20-04-26\main\backend`

---

## 📊 Overall Statistics

| Metric | Count | Size |
|--------|-------|------|
| **Root-level Files** | 83 files | 0.57 MB |
| **src/ Files** | 68 files | 443.66 KB |
| **config/ Files** | 2 files | 7.81 KB |
| **Total Source Code** | ~153 files | ~450 KB |

---

## 🏗️ Directory Structure

### Backend Root Level

```
backend/
├── src/                          [Main application code - 68 files, 443.66 KB]
├── config/                       [Configuration files - 2 files, 7.81 KB]
├── logs/                         [Application logs]
├── node_modules/                 [Dependencies - excluded from audit]
├── package.json                  [Project dependencies and scripts]
├── package-lock.json             (214.41 KB)
├── .env                          (2.97 KB)
├── .env.secure.example           (1.73 KB)
├── .gitignore                    (0.55 KB)
├── .dockerignore                 (0.8 KB)
├── docker-compose.yml            (1.89 KB)
├── Dockerfile                    (2.93 KB)
├── ecosystem.config.js           (0.23 KB)
└── [83 root-level files total - see Root Files section below]
```

---

## 📁 Detailed Directory Breakdown

### 1. **src/ - Main Application Source Code** (68 files, 443.66 KB)

Core application structure organized by architectural layers:

#### **src/server.js** (27.74 KB)
- Main application entry point
- Express server configuration
- Application initialization

#### **src/config/** - Configuration & Services Setup (5 files, 18.99 KB)
```
src/config/
├── cache.js                 (6.52 KB)  - Caching layer configuration
├── firebase.js              (0.12 KB)  - Firebase initialization
├── firebase.ts              (0.22 KB)  - Firebase TypeScript definitions
├── firebase-secure.js       (3.98 KB)  - Secure Firebase configuration
└── pino.js                  (4.19 KB)  - Logging configuration
```
**Purpose:** Central configuration for external services (Firebase, caching, logging)

#### **src/controllers/** - Business Logic Layer (7 files, 175.18 KB)
```
src/controllers/
├── admin.controller.js              (72.24 KB) ⚠️ LARGE - Multiple admin endpoints
├── nodes.controller.js              (64.65 KB) ⚠️ LARGE - Device/node management
├── tds.controller.js                (25.56 KB) - TDS (Telemetry Data System) handling
├── auth.controller.js               (8.71 KB)  - Authentication logic
├── evaratds.controller.js           (2.79 KB)  - Eva RA TDS specific controller
├── fix_graph.js                     (1.06 KB)  - Graph repair utility
└── fix_keys.js                      (0.67 KB)  - Key fixing utility
```
**Purpose:** Core business logic for API endpoints
**⚠️ Alert:** Two controllers exceed 64 KB - consider refactoring for readability

#### **src/middleware/** - Request Processing Layer (15 files, 50.60 KB)
```
src/middleware/
├── auth.middleware.js               (9.67 KB)  - Authentication verification
├── apiVersioning.js                 (7.30 KB)  - API version handling
├── rateLimiting.js                  (6.51 KB)  - Rate limiting enforcement
├── tenantMiddleware.js              (4.02 KB)  - Multi-tenant context
├── errorHandler.js                  (4.58 KB)  - Centralized error handling
├── rbac.middleware.js               (3.22 KB)  - Role-based access control
├── apiKeyAuth.middleware.js         (2.74 KB)  - API key validation
├── validateQuery.js                 (2.35 KB)  - Query parameter validation
├── validate.js                      (2.12 KB)  - General validation
├── authLimiter.js                   (1.70 KB)  - Auth-specific rate limiting
├── adminOnly.middleware.js          (1.40 KB)  - Admin-only access
├── tenantCheck.middleware.js        (1.27 KB)  - Tenant validation
├── audit.middleware.js              (1.25 KB)  - Audit logging
├── validateRequest.js               (0.77 KB)  - Request validation
└── rateLimit.js                     (0.28 KB)  - Basic rate limiting
```
**Purpose:** HTTP middleware chain for security, validation, and logging
**Security Components:** Auth, RBAC, rate limiting, audit logging

#### **src/routes/** - HTTP Routing Layer (8 files, 23.73 KB)
```
src/routes/
├── thingspeakConfig.routes.js       (5.92 KB)  - ThingSpeak configuration endpoints
├── health.js                        (8.57 KB)  - Health check routes
├── admin.routes.js                  (3.37 KB)  - Admin API endpoints
├── admin.routes.ts                  (0.94 KB)  - TypeScript admin routes
├── tds.routes.js                    (1.45 KB)  - TDS API routes
├── evaratds.routes.js               (0.85 KB)  - Eva RA TDS routes
├── auth.routes.js                   (0.85 KB)  - Authentication routes
└── nodes.routes.js                  (0.79 KB)  - Node management routes
```
**Purpose:** Express route definitions
**Mixed Tech:** Some routes in TypeScript (.ts), others in JavaScript

#### **src/services/** - Business Services Layer (10 files, 77.46 KB)
```
src/services/
├── deviceStateService.js            (19.51 KB) - Device state management
├── mqttClient.js                    (12.97 KB) - MQTT protocol client
├── waterAnalyticsEngine.js          (13.56 KB) - Analytics computation engine
├── analyticsService.js              (7.83 KB)  - Analytics aggregation
├── telemetryArchiveService.js       (7.89 KB)  - Historical data archival
├── channelMetadataService.js        (7.31 KB)  - Channel metadata management
├── socketValidation.js              (3.97 KB)  - WebSocket validation
├── thingspeakService.js             (4.00 KB)  - ThingSpeak API integration
├── redisClient.js                   (0.28 KB)  - Redis client wrapper
└── cacheService.js                  (0.14 KB)  - Cache service wrapper
```
**Purpose:** Encapsulated business service implementations
**Key Services:** MQTT, WebSocket, Analytics, Device State, Telemetry

#### **src/schemas/** - Data Validation Schemas (5 files, 11.53 KB)
```
src/schemas/
├── index.schema.js                  (8.49 KB)  - Main validation schemas
├── tds.schema.js                    (1.77 KB)  - TDS data schemas
├── thingspeak.schema.js             (0.88 KB)  - ThingSpeak schemas
├── customer.schema.js               (0.45 KB)  - Customer schemas
└── zone.schema.js                   (0.43 KB)  - Zone schemas
```
**Purpose:** Zod-based input validation schemas
**Technology:** Zod validation library

#### **src/utils/** - Utility Functions (14 files, 50.70 KB)
```
src/utils/
├── hybridDataResolver.js            (9.58 KB)  - Data resolution logic
├── fieldMappingResolver.js          (4.66 KB)  - Field mapping utility
├── cacheVersioning.js               (4.05 KB)  - Cache versioning logic
├── validateEnv.js                   (3.70 KB)  - Environment validation
├── checkDeviceVisibility.js         (3.47 KB)  - Device access control
├── testStatusCalculation.js         (3.86 KB)  - Test status computation
├── logger.js                        (2.56 KB)  - Logging utility
├── AppError.js                      (2.01 KB)  - Custom error class
├── errorResponse.js                 (2.01 KB)  - Error response formatter
├── auditLogger.js                   (2.54 KB)  - Audit logging
├── requestSanitizer.js              (3.62 KB)  - Input sanitization
├── resolveDevice.js                 (1.90 KB)  - Device resolution
├── deviceConstants.js               (0.79 KB)  - Device constants
└── asyncHandler.js                  (0.54 KB)  - Async/await wrapper
```
**Purpose:** Reusable utility functions and helpers
**Key Features:** Validation, caching, error handling, sanitization, logging

#### **src/workers/** - Background Jobs (2 files, 17.69 KB)
```
src/workers/
├── telemetryWorker.js               (10.77 KB) - Telemetry data processing
└── deviceStatusCron.js              (6.92 KB)  - Device status updates
```
**Purpose:** Scheduled and background job processing
**Technology:** Node-schedule for cron jobs

#### **src/dump_device.js** (0.87 KB)
Utility script for device data export/debugging

---

### 2. **config/ - Configuration Directory** (2 files, 7.81 KB)

```
config/
├── acl.acl                          (3.65 KB)  - Access Control List configuration
└── mosquitto.conf                   (4.16 KB)  - MQTT Broker (Mosquitto) configuration
```
**Purpose:** External service configurations
**Services:** MQTT Broker (Mosquitto), Access Control

---

### 3. **Root-Level Files** (83 files, 0.57 MB)

#### **Environment & Configuration** (4 files)
```
.env                                 (2.97 KB)  - Environment variables
.env.secure.example                  (1.73 KB)  - Secure env template
.gitignore                           (0.55 KB)  - Git exclusions
.dockerignore                        (0.8 KB)   - Docker build exclusions
```

#### **Docker** (3 files)
```
Dockerfile                           (2.93 KB)  - Container image definition
docker-compose.yml                   (1.89 KB)  - Multi-container setup
```

#### **NPM/Node** (3 files)
```
package.json                         (0.96 KB)  - Project manifest
package-lock.json                    (214.41 KB) - Dependency lock file
ecosystem.config.js                  (0.23 KB)  - PM2 configuration
```

#### **Diagnostic & Debug Scripts** (30+ files)
These are utility scripts for troubleshooting and verification:

**Device Management:**
- `check_active_devices.js` (1.51 KB)
- `check_all_devices.js` (1.1 KB)
- `check_device_ownership.js` (2.01 KB)
- `check_duplicates.js` (1.34 KB)
- `verify_device_stored.js` (3.39 KB)
- `verify_ev_tds_001.js` (1.38 KB)
- `query_raw_devices.js` (0.93 KB)

**Database & State:**
- `check_database_state.js` (5.45 KB)
- `check_flow_device_config.js` (2.27 KB)
- `check_superadmins.js` (0.85 KB)
- `monitor_device_creation.js` (5.31 KB)
- `urgent_check.js` (1.9 KB)
- `quick_verify.js` (2.63 KB)

**Testing & Verification:**
- `test_api.js` (0.6 KB)
- `test_channels.js` (0.42 KB)
- `test_complete_chart_flow.js` (3.46 KB)
- `test_complete_flow.js` (7.26 KB)
- `test_create_node_logging.js` (1.85 KB)
- `test_create_tds_device.js` (5.67 KB)
- `test_device_creation_flow.js` (3.43 KB)
- `test_device_visibility.js` (21.13 KB)
- `test_e2e_final.js` (3.26 KB)
- `test_firestore_logic.js` (1.36 KB)
- `test_himalaya.js` (1.8 KB)
- `test_meter.js` (1.13 KB)
- `test_n1_fix.js` (10.79 KB)
- `test_resolve_device.js` (0.69 KB)
- `test_tds_access.js` (6.74 KB)
- `test_tds_api.js` (1.53 KB)
- `test_tds_endpoint_direct.js` (1.73 KB)
- `test_tds_field_fix.js` (3.92 KB)
- `test_tds_ids.js` (1.05 KB)
- `test_tds_meta_ids.js` (0.9 KB)
- `test_tds_with_id_token.js` (2.22 KB)
- `test_toggle.js` (1.34 KB)
- `test_with_correct_uid.js` (2.29 KB)

**Repair & Cleanup:**
- `fix_device_id_mismatches.js` (7.2 KB)
- `fix_existing_tds_device.js` (7.54 KB)
- `fix_orphaned_tds_devices.js` (3.54 KB)
- `fix_tds_field_mapping.js` (1.6 KB)
- `cleanup_orphaned_metadata.js` (3.45 KB)
- `recreate_tds_metadata.js` (2.6 KB)
- `repair_tds_metadata.js` (4.77 KB)

**Diagnostics:**
- `full_diagnostic.js` (4.06 KB)
- `full_system_diagnostic.js` (7.1 KB)
- `diagnostic_summary.js` (4.97 KB)
- `debug_device_status.js` (8.33 KB)
- `debug_tds_fields.js` (2.12 KB)
- `diagnose_batch_write.js` (9.16 KB)
- `diagnose_tds_creation.js` (4.88 KB)
- `diagnose_tds_data.js` (3.41 KB)
- `diagnose_tds_devices.js` (5.21 KB)
- `find_root_cause.js` (2.67 KB)
- `simulate_frontend_flow.js` (3.84 KB)

**Provisioning & Utilities:**
- `provision_user.js` (1.65 KB)
- `get_test_token.js` (3.41 KB)
- `update_obh.js` (0.87 KB)

**API & Endpoint Testing:**
- `verify_tds_endpoints.js` (1.88 KB)

#### **Security & Verification Scripts**
```
verify-env-security.bat              (3.08 KB)
verify-env-security.ps1              (5.66 KB)
verify-firebase-rotation.sh           (3.92 KB)
cleanup-git-env.sh                   (1.87 KB)
test-firestore-connectivity.sh       (1.54 KB)
```

#### **Documentation & Guides** (7 files, ~70 KB)
```
COMPREHENSIVE_SECURITY_AUDIT_REPORT.md    (65.36 KB) ⚠️ LARGE
ERROR_HANDLER_GUIDE.md                    (7.08 KB)
FIX_GUIDE_TDS_METADATA.md                 (4.8 KB)
FIREBASE_KEY_ROTATION_GUIDE.md            (11.56 KB)
FIREBASE_ROTATION_ACTION_PACKAGE.md       (11.76 KB)
FIREBASE_ROTATION_CHECKLIST.md            (5.3 KB)
TDS_DEVICE_COMPLETE_FIX_GUIDE.md          (9.26 KB)
ZOD_VALIDATION_GUIDE.md                   (9.46 KB)
```

#### **Logs & Output**
```
test_output.log                      (2.6 KB)
logs/                                [Directory for runtime logs]
```

#### **Project Meta**
```
DEVICE_ASSIGNMENT_DEBUG.js           (Root level debug script)
DEVICE_ASSIGNMENT_FLOW.txt           (Flow documentation)
DEVICE_MISMATCH_ANALYSIS.md          (Issue analysis)
DEVICE_MISMATCH_FIX_SUMMARY.md       (Fix documentation)
```

---

## 📦 Package Dependencies

### Production Dependencies (14 packages)

```json
{
  "@sentry/node": "^10.42.0",              // Error tracking & monitoring
  "@socket.io/redis-adapter": "^8.3.0",   // Real-time communication scaling
  "axios": "^1.13.6",                     // HTTP client
  "cors": "^2.8.6",                       // Cross-Origin Resource Sharing
  "dotenv": "^17.3.1",                    // Environment variable management
  "express": "^5.2.1",                    // Web framework (LATEST VERSION)
  "express-rate-limit": "^8.3.1",         // Rate limiting middleware
  "firebase-admin": "^13.7.0",            // Firebase Admin SDK
  "helmet": "^8.1.0",                     // Security headers
  "ioredis": "^5.10.0",                   // Redis client
  "mqtt": "^5.15.0",                      // MQTT protocol client
  "node-cache": "^5.1.2",                 // In-memory caching
  "node-schedule": "^2.1.1",              // Cron job scheduling
  "pino": "^9.4.0",                       // Logging framework
  "pino-http": "^10.3.0",                 // HTTP request logging
  "pino-pretty": "^10.3.1",               // Pretty log formatting
  "socket.io": "^4.8.3",                  // WebSocket library
  "winston": "^3.19.0",                   // Alternative logging
  "zod": "^4.3.6"                         // Runtime type validation
}
```

### Development Dependencies (1 package)
```json
{
  "nodemon": "^3.1.14"                    // Development auto-reload
}
```

### Key Technology Stack Summary
- **Server:** Express 5.2.1 (latest)
- **Real-time:** Socket.io + Redis adapter
- **Logging:** Pino (primary) + Winston (alternative)
- **Validation:** Zod
- **Security:** Helmet, Rate limiting, Sentry monitoring
- **Data Layer:** Firebase Admin SDK, MQTT, Redis
- **Background Jobs:** Node-schedule

---

## 🔍 Code Quality Observations

### Large Files (Refactoring Candidates)
- `admin.controller.js` (72.24 KB) - Likely multiple concerns mixed
- `nodes.controller.js` (64.65 KB) - Likely multiple concerns mixed
- `test_device_visibility.js` (21.13 KB) - Complex test logic

### Architecture Patterns Observed
✅ **Good practices:**
- Clear separation of concerns (controllers, services, middleware, routes)
- Centralized error handling middleware
- Validation layer with schemas (Zod)
- Security middleware chain (auth, RBAC, rate limiting)
- Audit logging infrastructure

⚠️ **Potential Issues:**
- Mixed TypeScript and JavaScript (.ts and .js files)
- Large controller files suggesting mixed responsibilities
- Many diagnostic/test scripts at root level (should be in separate test directory)
- Dual logging systems (Pino + Winston)
- Extensive debugging/diagnostic code in production structure

### Security Components Identified
- API Key authentication middleware
- Role-Based Access Control (RBAC)
- Rate limiting (multiple implementations)
- Tenant isolation checks
- Admin-only access middleware
- Audit logging
- Request sanitization
- Sentry error tracking

### External Integrations
- Firebase (authentication, database)
- Redis (caching, session management, pub/sub)
- MQTT (IoT device communication)
- Socket.io (real-time communication)
- ThingSpeak (IoT data platform)
- Sentry (error tracking)

---

## 🎯 Recommendations for Audit Focus Areas

1. **Controllers:** Review business logic in `admin.controller.js` and `nodes.controller.js`
2. **Security:** Verify middleware chain effectiveness and rate limiting configurations
3. **Data Validation:** Review Zod schemas in `src/schemas/`
4. **Dependencies:** Check for security vulnerabilities in 19 production packages
5. **Environment:** Secure handling of `.env` and Firebase credentials
6. **Error Handling:** Centralized error handler implementation and coverage
7. **Type Safety:** Migrate remaining `.js` files to `.ts` for type safety
8. **Testing:** Consolidate test files into proper test directory
9. **Code Organization:** Refactor large controllers and consolidate logging systems
10. **Documentation:** Update guides to reflect current codebase state

---

## 📋 Files Ready for Review

**High Priority (Security & Business Logic):**
- [src/controllers/admin.controller.js](src/controllers/admin.controller.js)
- [src/controllers/nodes.controller.js](src/controllers/nodes.controller.js)
- [src/middleware/auth.middleware.js](src/middleware/auth.middleware.js)
- [src/schemas/index.schema.js](src/schemas/index.schema.js)

**Medium Priority (Integration & Services):**
- [src/services/deviceStateService.js](src/services/deviceStateService.js)
- [src/services/mqttClient.js](src/services/mqttClient.js)
- [src/server.js](src/server.js)

**Audit Documentation:**
- [COMPREHENSIVE_SECURITY_AUDIT_REPORT.md](COMPREHENSIVE_SECURITY_AUDIT_REPORT.md)

---

*This structure map was generated on April 23, 2026 for comprehensive backend codebase auditing.*
