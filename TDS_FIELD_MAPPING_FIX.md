# TDS Field Mapping Fix - Complete Guide

## 🔴 THE PROBLEM

When you added a TDS device with your ThingSpeak channel, **TDS was reading from the wrong field**:

- Your ThingSpeak channel has:
  - **field1** = TDS values (what you want to show)
  - **field2** = Temperature values
  
- But the system was **hardcoding** field1 and field2, OR reading from another device's fields
- Result: Dashboard showed **wrong values** (flow meter data, other device's data, or zeros)

---

## ✅ WHAT WAS FIXED

### Fix #1: Backend now accepts TDS field mapping from frontend
**File:** `backend/src/controllers/admin.controller.js`

**Before:**
```javascript
// Hardcoded - always used field1 and field2
metadata.fields = {
    tds: "field1",
    temperature: "field2"
};
```

**After:**
```javascript
// Uses values from frontend form
const userTdsField = tdsField || "field1";
const userTempField = temperatureField || "field2";
metadata.fields = {
    tds: userTdsField,
    temperature: userTempField
};
```

---

### Fix #2: Added dedicated TDS telemetry handler
**File:** `backend/src/controllers/nodes.controller.js` - `getNodeTelemetry()` function

**New TDS-specific path:**
- Reads from metadata.fields.tds (not metadata.fields.water_level)
- Reads from metadata.fields.temperature (not trying to calculate water level)
- Returns: `{ tds_value, temperature, status }` (not `{ distance, level_percentage }`)
- Correctly extracts values from the **specified field numbers**

**Key code:**
```javascript
if (["evaratds", "tds"].includes(type)) {
    const fields = metadata.fields || {};
    const tdsField = fields.tds || "field1";  // Uses stored field mapping
    const temperatureField = fields.temperature || "field2";
    
    const latestFeed = feeds[feeds.length - 1];
    const tdsValue = parseFloat(latestFeed[tdsField]);  // ← Correct field!
    const temperature = parseFloat(latestFeed[temperatureField]);  // ← Correct field!
    
    return {
        tds_value: tdsValue,
        temperature: temperature,
        ...
    };
}
```

---

### Fix #3: Added TDS analytics handler
**File:** `backend/src/controllers/nodes.controller.js` - `getNodeAnalytics()` function

**New TDS-specific path for historical data:**
- Same field mapping logic as telemetry
- Returns historical TDS and temperature values
- Properly maps feeds to the correct fields

---

## 📊 HOW IT WORKS NOW

### When you add a TDS device:

```
ADD DEVICE FORM
    ↓
1. Enter Channel ID (e.g., 2481920)
2. Enter Read API Key (e.g., EHEK3A1XD48TY98B)
3. Click "Fetch Fields" button
4. System shows available fields with data
5. YOU SELECT:
   - TDS Field: field1
   - Temperature Field: field2
6. Click "Save"
    ↓
BACKEND STORES:
    metadata = {
        thingspeak_channel_id: "2481920",
        thingspeak_read_api_key: "EHEK3A1XD48TY98B",
        fields: {
            tds: "field1",        ← Your selection!
            temperature: "field2" ← Your selection!
        }
    }
```

### When you view dashboard:

```
FRONTEND: "Get TDS data for device XYZ"
    ↓
BACKEND getNodeTelemetry():
    1. Read metadata.fields.tds = "field1"
    2. Read metadata.fields.temperature = "field2"
    3. Call ThingSpeak API
    4. Extract: latestFeed["field1"] = 450  ← TDS value
    5. Extract: latestFeed["field2"] = 28.5 ← Temperature
    6. Return: { tds_value: 450, temperature: 28.5 }
    ↓
FRONTEND DISPLAYS:
    TDS: 450 ppm ✓
    Temperature: 28.5°C ✓
```

---

## 🔧 TO FIX AN EXISTING DEVICE

If you have a TDS device that's showing wrong data:

### Option 1: Delete and Re-add
1. Delete the device from admin panel
2. Re-add it with correct ThingSpeak channel and field mapping

### Option 2: Manual Database Fix
Run this in Firestore console:

```javascript
// Go to Firestore console
// Collection: evaratds
// Document: YOUR_DEVICE_ID

// Update the "fields" field to:
{
    "fields": {
        "tds": "field1",          // Change to your actual TDS field
        "temperature": "field2"    // Change to your actual temperature field
    }
}
```

---

## ✅ HOW TO VERIFY IT'S FIXED

### 1. Check in database:
- Go to Firestore
- Collection: `evaratds`
- Find your device
- Check document has: 
  ```
  fields: {
    tds: "field1",
    temperature: "field2"
  }
  ```

### 2. Check telemetry API:
```bash
curl http://localhost:5000/nodes/YOUR_DEVICE_ID/telemetry
```

Expected response:
```json
{
  "deviceId": "...",
  "tds_value": 450,
  "temperature": 28.5,
  "status": "Online",
  "field_mapping": {
    "tds_field": "field1",
    "temperature_field": "field2"
  }
}
```

### 3. Check dashboard:
- Dashboard should show correct TDS and temperature values
- Values should match what you see in ThingSpeak channel

---

## 📝 DEBUGGING CHECKLIST

If TDS is still showing wrong values:

| Symptom | Check This |
|---------|-----------|
| Shows 0 for TDS | Is ThingSpeak sending data in field1? |
| Shows weird number | Check you selected correct field in form |
| Shows flow meter data | Check Channel ID - might be wrong device |
| Shows temperature as TDS | Check field mapping - might be swapped |
| Data not updating | Check Read API Key - might be invalid |

---

## 🚀 NEXT STEPS

1. **Test the fix**: Run `node test_tds_field_fix.js`
2. **Verify your TDS devices**: Open dashboard, check values
3. **If still issues**: Check logs in `[TDS]` section when fetching data

The system now **correctly reads from your specified ThingSpeak fields** instead of hardcoding or mixing up fields!
