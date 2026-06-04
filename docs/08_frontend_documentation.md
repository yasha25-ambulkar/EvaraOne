# 08. Frontend Documentation

## A. Routing & Protected Access
EvaraOne implements role-based route protection using React Router DOM:

* **`/login` (Public)**: Simple, entry-level login card. Unauthenticated users are redirected here.
* **Main Layout (`/map`, `/dashboard`, `/nodes`, `/node/:id`) (Protected)**: Accessible to any user with a validated session (roles: `customer`, `community_admin`, `superadmin`).
* **Device Analytics (`/evaratank`, `/evaraflow`, `/evaradeep`, `/evaratds/:id`) (Protected)**: Specialized telemetry boards that render live widgets based on the node's type.
* **Superadmin Portal (`/superadmin/*`) (Restricted)**: Protected by role verification. Only users with the `superadmin` role can access this sub-tree. Attempts by unauthorized users trigger a redirect back to the home map.

---

## B. State Management Architecture
The frontend client implements a lightweight, high-performance state architecture:

1. **Server State (TanStack React Query)**:
   * REST requests are handled via React Query hooks.
   * Leverages automatic cache invalidation, loading states, and background synchronization.
2. **Context-Based Global State**:
   * **`AuthContext`**: Manages the logged-in user profile, role classification, and JWT refresh operations.
   * **`TenancyContext`**: Isolates tenant identifiers and maps accessible regions to the current UI session.
3. **Local State**:
   * Standard React `useState` hooks manage modal states, tab selections, and filter configurations inside components.

---

## C. Core Reusable Components

### 1. `RealisticTank.tsx` (3D Interactive Render)
* Uses Three.js inside a React Three Fiber `<Canvas>` container to display a realistic 3D representation of a water tank.
* Fluid animations simulate waves and level changes in real-time.
* Utilizes `@react-three/drei` helper functions to apply realistic reflections and shadows.

### 2. `HierarchyTreeView.tsx` (Multi-level Tree Selector)
* Renders an interactive tree diagram of zones and devices for administrators.
* Features expanding/collapsing folders, search filtering, and drag-and-drop mechanics to easily reassign customers to different zones.

### 3. `AIChatWidget.tsx` (AI Operational Companion)
* An interactive chat drawer accessible from the bottom right corner of the dashboard.
* Connects to the backend AI agent service to answer natural language questions about the system (e.g., *"How much water did Tank A consume yesterday?"* or *"Are there any offline sensors in Zone B?"*).

### 4. `TDSMeterVisual.tsx` & `TDSProbeVisual.tsx`
* High-fidelity SVG gauges that animate based on incoming parts per million (ppm) readings.
* Features clean color scales that change based on water safety thresholds.

---

## D. Custom Hook Catalog

### 1. `useWaterAnalytics`
Calculates volume and consumption metrics from raw level data:
* **Inputs**: Historical telemetry array, tank dimensions (height, length, breadth).
* **Calculations**: Raw distance $\rightarrow$ water level $\rightarrow$ total capacity $\rightarrow$ volume in liters $\rightarrow$ flow rate (L/min).
* **Outputs**: `volumeLitres`, `fillRateLpm`, `drainRateLpm`, `timeToEmpty`, `timeToFull`, and `waterState` (CONSUMPTION, REFILL, or STABLE).

### 2. `useDeviceAnalytics`
Pulls and manages live telemetry streams from the backend API:
* Opens a Socket.io channel targeting a specific hardware ID.
* Automatically merges incoming real-time socket events with React Query's historical cache.
* Returns combined telemetry lists, online status updates, and stale-data warning indicators.
