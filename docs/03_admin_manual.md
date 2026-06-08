# 03. Admin Manual

## A. Administrative Role Hierarchy
EvaraOne implements a strict, verified **Role-Based Access Control (RBAC)** hierarchy:
1. **Superadmin**: Global administration credentials. Absolute permission bypass, access to the multi-level region/zone configuration, global system switches, audit logs, and hardware device parameter controls.
2. **Community / Zone Admin**: Regional administration credentials. Manages a specific zone or collection of customers. Can add/modify customers and nodes within their assigned zone boundaries.
3. **Customer / Tenant**: Regular operational credentials. Access limited to their assigned nodes and telemetry views.
4. **Viewer**: Read-only credentials. Can query endpoints and view pages but is blocked from staging any database mutations (returns `403 Access denied` on POST/PUT/DELETE).

---

## B. Administrative Dashboard (`/superadmin`)
When logging in as a `superadmin`, you are routed to the Admin Layout featuring the **Superadmin Management Center**:
* **High-Level Fleet KPIs**: Fleet status cards presenting total registered devices, online ratio, active alerts count, and total tenants count.
* **Global Activity Feed**: Real-time log showing system modifications, user provisioning, and device connections.
* **System Health Monitor**: A Recharts-driven graph mapping memory usage, event loop latency, and API response speeds.

---

## C. Managing Regions, Zones & Hierarchy Tree
EvaraOne handles thousands of nodes via a hierarchical system managed via the **Hierarchy Tree View** (`HierarchyTreeView.tsx`):
* **Hierarchy Structure**:
  ```
  Global Fleet (Superadmin)
   └── Regional Zone (e.g., North District)
        └── Customer Account (e.g., Prime Apartments)
             └── Physical Nodes (e.g., Tank-01, TDS-03, Flow-02)
  ```
* **Adding a Zone**:
  1. Navigate to `/superadmin/zones`.
  2. Click **"Create Zone"**.
  3. Enter Name (e.g., West Sector) and descriptive tags.
  4. The zone is stored in Firestore and loaded dynamically in the navigation list.

* **Onboarding a Customer**:
  1. Navigate to `/superadmin/customers` and click **"Provision Customer"**.
  2. Complete their email details, assigned subscription plan (`free`, `pro`, `enterprise`), and select their parent regional Zone.
  3. Clicking submit creates a corresponding Firestore profile linked to their Firebase UID.

---

## D. Registering & Configuring IoT Devices
To hook up physical sensors to the EvaraOne interface:
1. Navigate to the **Configure Node Panel** (`/configure/:id` or `/superadmin/config`).
2. Input the physical hardware identification key (Hardware ID / Device ID).
3. Select the Node Type: `EvaraTank`, `EvaraFlow`, `EvaraDeep`, `EvaraMotor`, or `EvaraValve`.
4. Define the **ThingSpeak Channel Metadata**:
   * **ThingSpeak Channel ID**: The numeric ID from your ThingSpeak channel.
   * **ThingSpeak Read API Key**: Read token to fetch raw feeds.
   * **Sensor Field Mapping**: Map physical parameters to ThingSpeak columns. For example:
     * `water_level` $\rightarrow$ `field2`
     * `tds` $\rightarrow$ `field1`
     * `flow_rate` $\rightarrow$ `field3`
5. Map **Physical Dimensions** (specifically for `EvaraTank` or `EvaraDeep` devices):
   * Height/Depth (cm)
   * Length (cm)
   * Breadth (cm)
   * *Note*: These values are essential to translate raw ultrasonic distance metrics into volume in liters.

---

## E. Device Visibility & Parameter Controls
Superadmins possess exclusive control over what customers can see on their dashboards through two specialized control layers:

### 1. Main Device Visibility Toggle
* **Location**: Customer detail view inside the superadmin console.
* **Function**: A master slide switch that hides/reveals a specific device on the customer's dashboard.
* **Endpoint**: `PATCH /api/v1/admin/devices/:id/visibility`.
* **Use Case**: Allows admins to temporarily suspend client access during maintenance or due to late payment.

### 2. Parameter Control Toggles
* **Location**: Device configuration drawer in the administrative console.
* **Function**: Granular check-boxes controlling which telemetry features are exposed to the client.
* **Configurable Parameters**:
  * **Level/Volume Tracking**: Hide/show tank percentage indicators.
  * **Flow Analytics**: Hide/show flow consumption trend Recharts.
  * **Water Quality Metrics**: Hide/show TDS and pH parameters.
* **Endpoint**: `PATCH /api/v1/admin/devices/:id/parameters`.
* **Use Case**: Enables premium tiering (e.g., basic users only see level tracking; pro users unlock flow analytics).

---

## F. Audit Logging & System Security Controls
Every critical administrative operation (such as updating configurations, deleting users, or changing device visibility) triggers an automated **Audit Log entry** through the `audit.middleware.js` layer.
* Logs capture: **Timestamp, Operator User ID, Operator Role, Action Name, Target Resource, IP Address, and Change Delta**.
* Superadmins can inspect these records in the **Audit Logs Viewer** (`/superadmin/audit`) for complete accountability.
