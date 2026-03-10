# 🛰️ Evara-Tech IoT SaaS Platform

Real-time IoT monitoring and device management platform for water infrastructure.

**Stack**: React · Vite · Express · Firebase · Socket.IO · Redis · ThingSpeak

---

## 🚀 Deploy to Railway (One-Click)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select this repository — Railway auto-detects `railway.json`
4. Add environment variables (see below)
5. Optionally add a **Redis** service in the same project

### Required Environment Variables

Set these in the Railway service dashboard:

| Variable | Description |
|:---|:---|
| `NODE_ENV` | `production` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Full private key (with `\n` escapes) |
| `FIREBASE_DATABASE_URL` | Firestore database URL |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket name |
| `JWT_SECRET` | Random secret string |
| `ENCRYPTION_KEY` | 32-char encryption key |
| `THINGSPEAK_API_KEY` | ThingSpeak read API key |
| `VITE_FIREBASE_API_KEY` | Firebase client API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_API_URL` | `/api/v1` |

> **Note**: `PORT` and `REDIS_URL` are automatically provided by Railway.

---

## 💻 Local Development

```bash
# Install all dependencies
npm run build

# Start both frontend and backend
npm run dev
```

- Frontend: [http://localhost:8080](http://localhost:8080)
- Backend: [http://localhost:8000](http://localhost:8000)

### Local Environment Setup

1. Copy `.env.example` to `backend/.env` (backend secrets)
2. Copy `.env.example` to `client/.env.local` (only `VITE_*` vars)

---

## 📦 Architecture

```
root/
├── backend/           # Express API + Socket.IO + Telemetry Worker
│   ├── src/
│   │   ├── config/    # Firebase, Redis, Cache
│   │   ├── controllers/
│   │   ├── middleware/ # Auth, Rate Limiting
│   │   ├── routes/
│   │   ├── workers/   # Telemetry ingestion
│   │   └── server.js  # Entry point (serves frontend in production)
│   └── package.json
├── client/            # React + Vite + Tailwind
│   ├── src/
│   └── package.json
├── railway.json       # Railway deployment config
├── package.json       # Root orchestrator
└── .env.example       # All required variables
```

**In production**, the Express backend serves the compiled React frontend as static files from a single Railway service.

---

## 🔒 Security

- All secrets externalized to environment variables
- Firebase Admin SDK uses env-based service account
- Helmet security headers enabled
- Rate limiting on all API routes
- CORS restricted to allowed origins
- Sentry error tracking integrated
