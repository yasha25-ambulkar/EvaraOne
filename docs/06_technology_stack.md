# 06. Technology Stack Documentation

## A. Frontend Client Stack
The user interface is built as a responsive, high-performance Single Page Application (SPA) using a modern, reactive stack:

* **Core Library**: **React 19.2.0**
  * Capitalizes on React 19's unified hydration engine and optimized concurrent rendering.
* **Programming Language**: **TypeScript 5.9.3**
  * Provides strict end-to-end typing across components, layouts, contexts, and API schemas.
* **Build System & Tooling**: **Vite 7.3.1**
  * Provides extremely fast Hot Module Replacement (HMR) and optimized Rollup assets compilation.
* **Styling & Theme Framework**: **Tailwind CSS v4.1.18**
  * Integrates the new `@tailwindcss/vite` plugin for fast styling compiles and native support for CSS-based `@theme` variables.
* **Routing Engine**: **React Router DOM 7.13.0**
  * Handles browser routing, protected paths, and role-based redirects.
* **Data Fetching & Cache Sync**: **TanStack React Query v5.90.21**
  * Manages client-side caches, stale-while-revalidate policies, and request retries.
* **WebSocket Integration**: **Socket.io-Client 4.8.3**
  * Establishes real-time duplex connections for live telemetry feeds.
* **Advanced Charting**: **Recharts 3.7.0**
  * Handles interactive telemetry graphs, bar charts, comparison logs, and peak analysis charts.
* **3D Rendering Graphics**: **Three.js & React Three Fiber (R3F) v9.5.0**
  * Powers the animated 3D `RealisticTank` cylinder with realistic fluid dynamics.
* **Guided Tour Framework**: **Driver.js 1.4.0**
  * Generates the step-by-step onboarding walkthrough guides.
* **Animations**: **Framer Motion 12.34.0**
  * Manages page transitions, drawer slides, and card fade effects.
* **Mapping Library**: **Leaflet & React Leaflet 5.0.0**
  * Manages geographical device coordinates on high-contrast map layouts.

---

## B. Backend Application Stack
The server side is built on a fast, asynchronous Node.js framework designed for intensive data streaming and calculation pipelines:

* **Runtime Environment**: **Node.js (>=20.0.0)**
  * Asynchronous event-driven JavaScript engine.
* **Web Server Framework**: **Express 5.2.1**
  * Utilizes the new Express 5 engine, featuring native Promise handling in routes and middleware.
* **Security Middleware Suite**: **Helmet 8.1.0**
  * Sets secure HTTP headers (e.g., Content Security Policy, X-Frame-Options) to protect against common web vulnerabilities.
* **API Rate Limiter**: **Express Rate Limit 8.3.1**
  * Protects authentication and critical database endpoints from brute-force attempts.
* **Validation Engine**: **Zod 4.3.6**
  * Ensures incoming requests (bodies, queries, params) strictly match expected types and structures before hitting the database.
* **Logging System**: **Pino 9.4.0 & Pino HTTP**
  * Low-overhead, high-performance structured JSON logger for server monitoring.
* **Secondary Logging Support**: **Winston 3.19.0**
  * Manages audit logs and file-based backups.
* **MQTT Driver**: **MQTT.js 5.15.0**
  * Subscribes to live broker streams for industrial hardware integrations.
* **Cache & Memory Store**: **ioredis 5.10.0**
  * Interacts with Redis to store telemetry snapshots and manage worker states.
* **Task Scheduler**: **Node Schedule 2.1.1**
  * Runs crons for nightly calculations and database maintenance.
* **Monitoring & Error Tracking**: **Sentry Node SDK 10.42.0**
  * Automated real-time server error reporting.

---

## C. Database & Cloud Architecture
EvaraOne relies on Firebase's enterprise-grade cloud suite to ensure high availability and data integrity:

* **Database Engine**: **Google Firebase Firestore**
  * A scalable NoSQL document database used for configuration and system metadata.
* **Authentication Provider**: **Google Firebase Auth**
  * Manages secure client registration, credentials verification, and session persistence.
* **Administrative Control**: **Firebase Admin SDK (Node) v13.7.0**
  * Grants the backend secure access to Firestore and auth operations.

---

## D. Third-Party Interfaces
* **ThingSpeak API**: Restful ingestion service used to aggregate and structure distance measurements from physical IoT microcontrollers.
