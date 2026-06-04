# 10. API Documentation

## A. Authentication Endpoints

### 1. Verify Token
Verify a Firebase ID Token and retrieve the user's role and tenant profile details.
* **Endpoint**: `POST /api/v1/auth/verify-token`
* **Access**: Public (Protected by rate limiter: Max 5 requests / 15 minutes)
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_9281a8b",
      "email": "manager@apartment.com",
      "displayName": "Property Manager",
      "role": "customer",
      "plan": "enterprise",
      "community_id": "comm_north_01"
    }
  }
  ```

---

## B. Device & Telemetry Endpoints

### 1. Get All Mapped Devices
Retrieve a list of physical devices assigned to the current user's profile.
* **Endpoint**: `GET /api/v1/nodes`
* **Access**: Authenticated (Requires valid Bearer Token)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "nodes": [
      {
        "id": "ev_tank_001",
        "name": "Overhead Storage Tank 1",
        "device_type": "EvaraTank",
        "status": "ONLINE",
        "last_value": 78.4,
        "location_name": "Sector 4 Block B"
      }
    ]
  }
  ```

### 2. Get Live Telemetry
Retrieve the latest computed state for a specific device.
* **Endpoint**: `GET /api/v1/nodes/:id/telemetry`
* **Access**: Authenticated (Requires matching Tenant ID)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "telemetry": {
      "deviceId": "ev_tank_001",
      "online": true,
      "lastUpdated": "2026-05-26T14:00:00Z",
      "waterLevelCm": 165.2,
      "percentage": 78.4,
      "volumeLitres": 23985.4,
      "totalCapacityLitres": 30580.0,
      "waterState": "STABLE",
      "rateLpm": 0.0,
      "timeToEmpty": null,
      "timeToFull": null
    }
  }
  ```

### 3. Get Device Graph Data (Hybrid Endpoint)
Retrieve highly optimized historical data arrays for charting.
* **Endpoint**: `GET /api/v1/nodes/:id/graph-hybrid`
* **Access**: Authenticated
* **Query Parameters**:
  * `range`: `24h` | `3d` | `1w` | `30d` (Defaults to `24h`)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "range": "24h",
    "dataPoints": [
      {
        "timestamp": "2026-05-26T13:00:00Z",
        "level": 78.1,
        "volume": 23890.0,
        "flow_rate": -12.5
      },
      {
        "timestamp": "2026-05-26T14:00:00Z",
        "level": 78.4,
        "volume": 23985.4,
        "flow_rate": 4.2
      }
    ]
  }
  ```

---

## C. TDS Quality Sensor Endpoints

### 1. Get Live TDS Quality Stream
Retrieve water quality indicators and TDS readings.
* **Endpoint**: `GET /api/v1/devices/tds/:id/telemetry`
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "deviceId": "ev_tds_001",
    "tds_ppm": 142.0,
    "quality_status": "EXCELLENT",
    "temp_celsius": 24.5,
    "last_updated": "2026-05-26T14:02:10Z"
  }
  ```

---

## D. Superadmin Configuration Endpoints

### 1. Update Device Parameter Toggles
Control which telemetry metrics are visible on the customer's dashboard.
* **Endpoint**: `PATCH /api/v1/admin/devices/:id/parameters`
* **Access**: Restricted (Superadmin Only)
* **Request Body**:
  ```json
  {
    "show_level": true,
    "show_flow": false,
    "show_quality": true
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Device parameter visibility updated successfully."
  }
  ```
