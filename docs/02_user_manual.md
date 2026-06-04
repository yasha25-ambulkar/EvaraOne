# 02. User Manual / End User Guide

## A. Authentication Flows
### 1. User Login
1. Navigate to the login portal at `http://localhost:8081/login`.
2. Enter your registered email address and password credentials.
3. Click the **"Sign In"** button.
4. *Behind the scenes*: The client initializes Firebase Client Auth, retrieves a fresh ID Token, pushes it to `/api/v1/auth/verify-token` to verify role hierarchy, and initiates session-based persistence redirecting you to `/map` or `/dashboard`.

### 2. User Registration
1. If you do not have an account, click the **"Register"** or **"Create Account"** link on the login card.
2. Complete the signup form details: Full Name, Email Address, and a secure password.
3. Upon clicking **"Sign Up"**, your account is registered in Firebase Authentication, a document is created in the Firestore `customers` collection, and you are automatically logged in with a default **"customer"** role.

### 3. Password Reset
1. Click **"Forgot Password?"** on the login interface.
2. Provide your registered email address.
3. A password recovery verification mail will be transmitted via Firebase Auth service, prompting you to reset your password securely.

---

## B. Navigation Overview
The top portion of the application provides a highly polished **glassmorphism header bar** (`navbar-glass`) that lets users quickly switch between active views:
* **Map View (`/map`)**: Interactive Leaflet Map presenting all allocated nodes across your geographical location.
* **Dashboard (`/dashboard`)**: Unified control room showing live cards for water level, flow rates, active alerts, and quick actions.
* **Nodes Explorer (`/nodes`)**: Filterable data grid containing every physical device assigned to your profile.
* **Settings (`/settings`)**: Profile administration, theme toggling (Light/Dark Mode), and notification options.

---

## C. The Guided Product Tour
Upon first-time login as a new `customer`, EvaraOne triggers an automated **Guided Site Tour** powered by `driver.js`:
* The tour will highlight the **Tank Level Card**, explaining the difference between raw ultrasonic distance and calculated volume.
* It navigates your attention to the **Consumption Trend Graph**, showcasing peak consumption tracking.
* It highlights **TDS Analytics** and explains water quality threshold states.
* Users can skip or step through the tour; it will set an `evara_tour_done` key in your browser's local storage once completed to prevent repetitive triggers.

---

## D. Interactive Dashboard Walkthrough
The main Customer Dashboard contains several interactive components:

### 1. Unified KPI Stats
Three distinct stat widgets provide high-level status details:
* **Total Volume Available**: Combines capacity across all online water tanks.
* **Current Net Flow Rate**: Displays aggregate consumption/refill rate in liters per minute (L/min).
* **Average TDS Index**: Aggregate water purity metric across all operational tanks.

### 2. The 3D Water Tank Card (`RealisticTank`)
* Displays an interactive 3D cylinder representation of your water tank.
* The liquid inside features custom animations simulating fluid motion.
* The color of the liquid shifts dynamically based on current water level percentage:
  * **Critical (<15%)**: Sleek Deep Crimson.
  * **Low (15% - 40%)**: Warm Premium Amber.
  * **Normal (40% - 100%)**: Curated Royal Teal.
* Highlights real-time estimates: **"Time to Empty"** (during consumption) or **"Time to Full"** (during refill cycles).

### 3. The TDS Total Dissolved Solids Card (`TDSCard`)
* Renders an interactive, responsive gauge representing water purity in parts per million (ppm).
* Incorporates a dual-channel visualizer showing a micro-probe and colored state badges:
  * **Excellent (0 - 150 ppm)**: Vibrant Green.
  * **Good (151 - 300 ppm)**: Teal Blue.
  * **Fair (301 - 500 ppm)**: Orange.
  * **Poor (>500 ppm)**: Bright Red.

---

## E. Customizing and Downloading Reports
Users can export historical data grids using the **Reports Downloader Widget** (`ReportsDownloader.tsx`):
1. **Select Device**: Choose from assigned tanks, flow meters, or TDS sensors.
2. **Choose Time Range**: Presets include **24 Hours**, **7 Days**, **30 Days**, or a **Custom Date Range Selector**.
3. **Format**: Select from **CSV** or **PDF** reports.
4. **Timezone Alignment**: The exported data matches the standard **Indian Standard Time (IST)** timezone format to prevent analytical mismatches.
5. Click **"Download Report"** to export the structured file.

---

## F. Troubleshooting & Common Mistakes
* **"Stale Telemetry Badge"**: A crimson badge warning `STALE DATA` appears if your hardware device hasn't posted a ThingSpeak feed in over 60 minutes. Check your local hardware power supply and Wi-Fi connection.
* **"Calculated Volume is Negative"**: This occurs if the physical ultrasonic sensor's distance reading exceeds your configured tank depth. Adjust your height parameters in the configuration panel.
