# 14. Environment Variables Documentation

## A. Client Environment Variables (`client/.env`)
These variables configure the Firebase client SDK and build settings. They are loaded in the browser and must be prefixed with `VITE_` to be exposed in a Vite environment.

| Variable Name | Purpose | Example Format | Status | Security Scopes |
| :--- | :--- | :--- | :--- | :--- |
| **`VITE_FIREBASE_API_KEY`** | Authenticates client-side requests to Firebase. | `AIzaSyA8281a8b_ExampleKey` | **Required** | Safe for public client bundles. |
| **`VITE_FIREBASE_AUTH_DOMAIN`** | The authorization domain for user sign-in. | `evara-one.firebaseapp.com` | **Required** | Safe for public client bundles. |
| **`VITE_FIREBASE_PROJECT_ID`** | The unique identifier for your Firebase project. | `evara-one` | **Required** | Safe for public client bundles. |
| **`VITE_FIREBASE_STORAGE_BUCKET`**| Cloud Storage bucket URL for storing files. | `evara-one.appspot.com` | Optional | Safe for public client bundles. |
| **`VITE_FIREBASE_APP_ID`** | The unique identifier for your Firebase Web App. | `1:9281a8b:web:b123` | **Required** | Safe for public client bundles. |

---

## B. Backend Environment Variables (`backend/.env`)
These variables configure the Express server, Firebase Admin SDK, logging systems, database connections, and external API integrations. **These values contain sensitive credentials and must never be exposed to the client.**

| Variable Name | Purpose | Example Format | Status | Security Scopes |
| :--- | :--- | :--- | :--- | :--- |
| **`PORT`** | Port number the Express application listens on. | `8081` | Optional | Internal Server config. |
| **`NODE_ENV`** | Application environment state. | `development` \| `production` | **Required** | Determines level logs and cache checks. |
| **`FIREBASE_PROJECT_ID`** | The project ID for the Firebase Admin SDK. | `evara-one` | **Required** | Private Server credential. |
| **`FIREBASE_CLIENT_EMAIL`** | The service account email for Firebase Admin. | `firebase-adminsdk@evara.iam.gserviceaccount.com` | **Required** | Private Server credential. |
| **`FIREBASE_PRIVATE_KEY`** | The private certificate key for Firebase Admin. | `"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANB..."` | **Required** | **High Risk**. Keep secure. |
| **`REDIS_URL`** | Connection string for the Redis instance. | `redis://default:password@host:6379` | Optional | Fallback to Firestore snapshot if missing. |
| **`SENTRY_DSN`** | Endpoint for Sentry error tracking. | `https://sentry.io/12345` | Optional | Safe. |
| **`LOG_LEVEL`** | Minimum log severity level to capture. | `info` \| `warn` \| `debug` | Optional | Internal Server config. |

---

## C. Security & Secrets Management Best Practices
To keep EvaraOne's production environments secure, adhere to the following best practices:
1. **Never Commit `.env` Files**: Ensure that `client/.env` and `backend/.env` are added to your `.gitignore` files.
2. **Rotate Keys Regularly**: Regularly rotate Firebase Service Account private keys and ThingSpeak API keys in your production environment.
3. **Escaping Line Breaks**: When adding the `FIREBASE_PRIVATE_KEY` to environment variables in hosted environments (like Railway or Docker envs), make sure to escape newline characters correctly:
   `FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")`
4. **Least Privilege Principles**: When generating Firebase service accounts, grant them only the minimum permissions required (e.g., `Firestore Admin` and `Firebase Auth Admin`) rather than full owner privileges.
