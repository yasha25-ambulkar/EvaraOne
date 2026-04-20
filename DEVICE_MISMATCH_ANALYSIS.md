# Device Count Mismatch Analysis

## ISSUE SUMMARY
- **Firestore DB**: Customer has 3-4 devices assigned
- **UI "All Nodes"**: Shows 5 devices
- **Expected**: UI should match DB count (3-4 devices for the customer)

---

## DATA FLOW TRACE

### STEP 1: Frontend Data Source
**File**: `client/src/pages/AllNodes.tsx`
```
AllNodes.tsx → useNodes() hook → deviceService.getMapNodes()
```

**File**: `client/src/hooks/useNodes.ts` (Lines 30-45)
```typescript
const mappedNodes = await deviceService.getMapNodes(
  undefined,
  isSuperAdmin ? undefined : user?.id  // ← PASSING user?.id as customerId
);
```

**Key Issue**: Passing `user?.id` as customerId parameter

---

### STEP 2: API Call
**File**: `client/src/services/DeviceService.ts` (Line 300)
```typescript
async getMapNodes(communityId?: string, customerId?: string): Promise<MapDevice[]> {
  const params: any = {};
  if (communityId) params.community_id = communityId;
  if (customerId) params.customer_id = customerId;  // ← This is user?.id (USER ID, not CUSTOMER ID!)
  
  const response = await api.get("/nodes", { params });
  return allNodes.map((data: any) => NodeService.mapNodeData(data));
}
```

**API Call Made**: `GET /nodes?customer_id={userId}`

---

### STEP 3: Backend Filtering Logic
**File**: `backend/src/controllers/nodes.controller.js` (Line 92)
```javascript
const filterCustomerId = req.query.customerId || null;  // ← Reading from query params

console.log(`[NodesController] getNodes:`, {
  userId: req.user.uid,
  userRole: req.user.role,
  filterCustomerId,  // ← This will be UNDEFINED if query param is "customer_id"!
  userCustomerId: req.user.customer_id
});
```

**⚠️ CRITICAL BUG**: Backend looks for `req.query.customerId` but frontend sends `customer_id`

---

## ROOT CAUSE IDENTIFIED

### THE MISMATCH CHAIN:

1. **Frontend sends**: `GET /nodes?customer_id={userId}`
   - Variable name: `customer_id`
   - Value: `user?.id` (the logged-in USER's ID, NOT customer ID)

2. **Backend expects**: `req.query.customerId`
   - Backend is looking for camelCase `customerId` but frontend sends snake_case `customer_id`
   - Result: `filterCustomerId = undefined` (not found)

3. **Backend logic when filterCustomerId is undefined** (Line 130-142):
   ```javascript
   if (filterCustomerId) {
     // Filter by provided customer ID
     query = query.where("customer_id", "==", filterCustomerId);
   } else if (req.user.role !== "superadmin") {
     // Filter by customer's own ID
     query = query.where("customer_id", "==", req.user.customer_id);
   } else {
     // Superadmin viewing all devices (no filter)
   }
   ```

4. **Problem**: 
   - Frontend passes `customer_id={userId}` but backend doesn't recognize it
   - Backend falls back to filtering by `req.user.customer_id`
   - BUT `userId !== customerId`, they are DIFFERENT fields!

---

## SECONDARY ISSUES FOUND

### Issue A: Parameter Naming Mismatch
- **Frontend sends**: `customer_id` (snake_case)
- **Backend expects**: `customerId` (camelCase)
- **Result**: Parameter ignored, wrong fallback logic used

### Issue B: Using user.id instead of user.customer_id
- **File**: `client/src/hooks/useNodes.ts` Line 38
```typescript
// WRONG:
isSuperAdmin ? undefined : user?.id

// SHOULD BE:
isSuperAdmin ? undefined : user?.customer_id
```

- **Current behavior**: Passing logged-in user's ID as customer ID
- **Expected behavior**: Should pass customer ID if available
- **Result**: Frontend filtering against wrong field

### Issue C: Possible Device Duplication
- Backend might be returning devices from multiple sources
- Check if devices are being duplicated in the response
- No deduplication logic in frontend

---

## THE FIX

### FIX #1: Backend - Accept both parameter formats
**File**: `backend/src/controllers/nodes.controller.js` (Line 92)

**Change from:**
```javascript
const filterCustomerId = req.query.customerId || null;
```

**Change to:**
```javascript
const filterCustomerId = req.query.customerId || req.query.customer_id || null;
```

---

### FIX #2: Frontend - Send correct customer ID
**File**: `client/src/hooks/useNodes.ts` (Line 38)

**Change from:**
```typescript
const mappedNodes = await deviceService.getMapNodes(
  undefined,
  isSuperAdmin ? undefined : user?.id,  // ← WRONG: user?.id
);
```

**Change to:**
```typescript
const mappedNodes = await deviceService.getMapNodes(
  undefined,
  isSuperAdmin ? undefined : user?.customer_id,  // ← CORRECT: user?.customer_id
);
```

---

### FIX #3: Frontend - Use consistent parameter naming
**File**: `client/src/services/DeviceService.ts` (Line 304)

**Change from:**
```typescript
if (customerId) params.customer_id = customerId;  // ← snake_case
```

**Change to:**
```typescript
if (customerId) params.customerId = customerId;  // ← camelCase (match backend)
```

Or update backend to recognize both.

---

## VALIDATION CHECKLIST

After applying fixes, verify:

- [ ] DB customer record shows device count: X
- [ ] UI "All Nodes" shows exactly X devices
- [ ] No duplicate devices in list
- [ ] Filtering by status/type still works
- [ ] Superadmin still sees all devices
- [ ] Customer sees only their own devices

---

## IMMEDIATE ACTION

1. **Apply Fix #1** (backend param naming) - Safest, backward compatible
2. **Apply Fix #2** (frontend customer_id) - Corrects data source
3. **Apply Fix #3** (consistent params) - Best practice
4. **Test**: Load "All Nodes" page and verify count matches DB

---

## DEBUG LOGS TO ADD

**Frontend** (`AllNodes.tsx`):
```typescript
console.log("Nodes loaded:", nodes.length);
nodes.forEach(n => console.log(n.id, n.label, n.customer_id));
```

**Backend** (`nodes.controller.js`):
```javascript
console.log(`[NodesController] filterCustomerId=${filterCustomerId}`);
console.log(`[NodesController] Query condition: customer_id == ${filterCustomerId || req.user.customer_id}`);
console.log(`[NodesController] Final nodes returned: ${nodes.length}`);
```
