# Firebase Environment Setup

This project should use only these environment files:

## 1. Backend env
- Local development: `/.env.development`
- Optional generic fallback: `/.env`

Backend Firebase is initialized only from:
- `backend/src/config/firebase.js`

Preferred backend variables:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET` (optional)
- `FIREBASE_DATABASE_URL` (optional)

If those are not set, backend falls back to Application Default Credentials.

## 2. Frontend env
- `/.env.development`
- optional fallback: `/.env`

Frontend Firebase is initialized only from:
- `client/src/lib/firebase.ts`
- Vite is configured via `client/vite.config.ts` to load env files from the project root
- `client/package.json` runs Vite in `development` mode so it consistently reads `/.env.development`

Preferred frontend variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_API_URL`
- `VITE_WS_URL` (optional)

## Recommended final setup
Keep only:
- `/.env.development` for local development
- `/.env` as optional shared fallback

Do not keep separate Firebase env values in `client/.env*` or `backend/.env*` files.
Both backend and frontend should read from the project root env files.

## Removed duplicate backend Firebase config files
These duplicate files were removed:
- `backend/src/config/firebase-secure.js`
- `backend/src/config/firebase.ts`

Use only:
- `backend/src/config/firebase.js`
