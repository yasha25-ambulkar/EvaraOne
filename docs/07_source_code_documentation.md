# 07. Source Code Documentation

## A. Monorepo Repository Structure
EvaraOne is organized as a unified monorepo containing distinct directories for backend and frontend code bases:

```
evara-one/
├── backend/                  # Asynchronous Node/Express server & workers
│   ├── config/               # DB, Logger, and caching configurations
│   ├── src/                  # Primary backend source files
│   │   ├── __tests__/        # Service, integration, and constant tests
│   │   ├── config/           # Firebase and Pino initializations
│   │   ├── constants/        # System and timing constants
│   │   ├── controllers/      # REST endpoint controllers
│   │   ├── middleware/       # RBAC, audit, authentication, and validation layers
│   │   ├── routes/           # Versioned API routes (auth, nodes, admin, tds)
│   │   ├── schemas/          # Zod validation models
│   │   ├── services/         # Calculation, polling, caching, and stream services
│   │   ├── utils/            # Math and formatting utilities
│   │   └── workers/          # Polling and state update cron workers
│   ├── package.json          # Server package specifications
│   └── Dockerfile            # Container definition
│
├── client/                   # Vite + React 19 Frontend Client App
│   ├── src/                  # Client source code
│   │   ├── assets/           # SVG, background PNG, and font assets
│   │   ├── components/       # Reusable React components (Charts, SVG, realistic tank)
│   │   ├── context/          # Multi-tenant and authentication React contexts
│   │   ├── hooks/            # Custom React Query hooks (analytics, telemetry)
│   │   ├── layouts/          # Base structures (MainLayout, AdminLayout)
│   │   ├── lib/              # Firebase client SDK initialization
│   │   ├── pages/            # View components (TDS, Tank, Flow, Admin dashboard)
│   │   ├── schemas/          # Client form validation models
│   │   ├── services/         # HTTP request wrappers
│   │   └── utils/            # Timezones, animations, and tour utilities
│   ├── package.json          # Client build configuration
│   └── vite.config.ts        # Vite configuration script
│
├── package.json              # Monorepo scripts (concurrently launches client/backend)
└── railway.toml              # Production cloud build configuration
```

---

## B. Coding Standards & Conventions
To ensure maintainability across EvaraOne's codebase, the following standards are strictly enforced:

### 1. Naming Conventions
* **React Components**: PascalCase (e.g., `RealisticTank.tsx`, `HierarchyTreeView.tsx`).
* **Source Files & Utilities**: camelCase (e.g., `deviceStateService.js`, `onboardingTour.ts`).
* **Database Models & Tables**: snake_case (e.g., `device_consumption_history`, `thingspeak_channel_id`).
* **Environment Variables**: UPPERCASE with underscores (e.g., `VITE_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`).

### 2. General Principles
* **Explicit Native Types**: Any new code in the `client/` folder must use strict TypeScript types instead of falling back to `any`.
* **State Immutability**: Front-end state modifications must run through functional set methods (`setVal(prev => ...)`).
* **Defensive Calculations**: Math inputs (such as sensor distance variables) must be validated (e.g., `isNaN` and boundaries checks) before running math engine functions.
* **Unified Error Propagation**: Backend routes must forward caught exceptions to Express's central `next(error)` handler rather than returning scattered custom error responses.
