# ISSUE #5: Centralized Error Handler Implementation Guide

## Overview
All controllers must use a centralized error handler instead of scattered `res.status().json({ error: ... })` patterns. This ensures consistent error responses and proper logging.

## Implementation Status

### ✅ Completed
- **middleware/errorHandler.js** - Centralized error middleware
- **utils/AppError.js** - Custom error class
- **server.js** - Registered error handler at bottom
- **tds.controller.js** - Updated getTDSTelemetry, getTDSHistory
- **admin.controller.js** - Uses AppError throughout

### ⏳ Remaining (Priority Order)
1. **evaratds.controller.js** - TDS device operations
2. **nodes.controller.js** - Node telemetry endpoints
3. **auth.controller.js** - Authentication endpoints
4. **checkDeviceVisibility.js** - Utility function

---

## Pattern: How to Update Controllers

### BEFORE (Scattered Errors) ❌
```javascript
exports.someFunction = async (req, res) => {
  try {
    if (!doc) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!isOwner) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to do something" });
  }
};
```

### AFTER (Centralized Error Handler) ✅
```javascript
const AppError = require("../utils/AppError.js");

exports.someFunction = async (req, res, next) => {
  try {
    if (!doc) {
      throw new AppError("Not found", 404);
    }
    if (!isOwner) {
      throw new AppError("Unauthorized", 403);
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);  // Delegate to centralized handler
  }
};
```

---

## Key Rules

### 1. **Import AppError** (at top of each controller)
```javascript
const AppError = require("../utils/AppError.js");
```

### 2. **Add `next` parameter** to all export functions
```javascript
// BEFORE
exports.someFunction = async (req, res) => {

// AFTER
exports.someFunction = async (req, res, next) => {
```

### 3. **Replace all error responses** with throw statements
```javascript
// BEFORE
return res.status(400).json({ error: "Invalid input" });

// AFTER
throw new AppError("Invalid input", 400);
```

### 4. **Status Code Mapping**
- **400**: Validation errors, bad request
- **401**: Authentication required
- **403**: Access denied, forbidden
- **404**: Resource not found
- **409**: Conflict (duplicate entry, constraint violation)
- **500**: Server error (default)

### 5. **Wrap try-catch** with next(error)
```javascript
try {
  // ... business logic
} catch (error) {
  next(error);  // Always delegate to centralized handler
}
```

---

## Error Handler Flow

```
Controller throws AppError
    ↓
Express catches error in try-catch → next(error)
    ↓
Centralized middleware/errorHandler.js
    ↓
Logs error (dev has details, prod is generic)
    ↓
Returns consistent JSON response
    ↓
Client receives error
```

---

## Common Patterns in Controllers

### Pattern 1: Validation Errors
```javascript
const { customerId } = req.body;
if (!customerId || customerId.trim() === "") {
  throw new AppError("Customer ID is required", 400);
}
```

### Pattern 2: Authorization Errors
```javascript
if (req.user.role !== "superadmin") {
  throw new AppError("Superadmin access required", 403);
}
```

### Pattern 3: Resource Not Found
```javascript
const doc = await db.collection("devices").doc(id).get();
if (!doc.exists) {
  throw new AppError("Device not found", 404);
}
```

### Pattern 4: Ownership Check
```javascript
const isOwner = await checkOwnership(req.user.uid, resourceId);
if (!isOwner) {
  throw new AppError("You do not own this resource", 403);
}
```

### Pattern 5: Duplicate/Conflict
```javascript
const existing = await db.collection("users").where("email", "==", email).limit(1).get();
if (!existing.empty) {
  throw new AppError("User with this email already exists", 409);
}
```

---

## Files That Need Updates

### Critical (High Impact)
- [ ] `evaratds.controller.js` - 10+ scattered errors
- [ ] `nodes.controller.js` - 8+ scattered errors
- [ ] `auth.controller.js` - 5+ scattered errors

### Important (Medium Impact)
- [ ] `checkDeviceVisibility.js` - 3+ scattered errors
- [ ] `channelMetadataService.js` - 2+ scattered errors

### Low Priority (Few Errors)
- [ ] Error utility functions
- [ ] Middleware files

---

## Testing the Error Handler

### Test 1: Validation Error (400)
```bash
curl -X POST http://localhost:8000/api/v1/admin/zones \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{}' # Missing required fields
# Expected: 400 with generic message in prod
```

### Test 2: Not Found Error (404)
```bash
curl -X GET http://localhost:8000/api/v1/nodes/invalid-id \
  -H "Authorization: Bearer TOKEN"
# Expected: 404 with "Device not found"
```

### Test 3: Authorization Error (403)
```bash
curl -X GET http://localhost:8000/api/v1/admin/zones \
  -H "Authorization: Bearer USER_TOKEN" # Non-admin token
# Expected: 403 with "Access denied"
```

---

## Response Format

All errors return this format:
```json
{
  "success": false,
  "error": {
    "message": "User-friendly message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "stack": "..." // Only in development
  },
  "timestamp": "2026-04-21T10:30:00.000Z"
}
```

Success responses (unchanged):
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Checklist for Each Controller Update

- [ ] Add AppError import
- [ ] Add `next` parameter to all exports
- [ ] Replace all `res.status().json({ error: ... })` with `throw new AppError(...)`
- [ ] Wrap all logic in try-catch
- [ ] Call `next(error)` in catch block
- [ ] Test: Run endpoint with invalid input → should return appropriate status
- [ ] Test: Run endpoint with unauthorized access → should return 403
- [ ] Test: Check server logs → errors should be logged with full stack trace

---

## Commands for Batch Updates

### Find all scattered error responses
```bash
grep -r "res.status.*json.*error" backend/src/controllers/
```

### Find controllers missing `next` parameter
```bash
grep -r "async (req, res)" backend/src/controllers/
```

### Find missing AppError imports
```bash
grep -L "AppError" backend/src/controllers/*.js
```

---

## Benefits of Centralized Error Handler

✅ **Consistency** - All errors return same format
✅ **Security** - Production hides internal details
✅ **Logging** - All errors logged server-side
✅ **Maintainability** - Single place to change error format
✅ **Debugging** - Development includes full stack traces
✅ **Client Experience** - Errors have consistent error IDs for support tickets

---

## Next Steps

1. Update remaining controllers using this pattern
2. Test each controller endpoint with error scenarios
3. Verify error responses in both dev and prod environments
4. Update frontend to handle consistent error format
5. Document API error codes for frontend developers
