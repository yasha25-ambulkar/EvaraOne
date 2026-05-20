import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredEnvKeys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
] as const;

const hasFirebaseConfig = requiredEnvKeys.every((key) => Boolean(import.meta.env[key]));

export const isFirebaseEnabled = hasFirebaseConfig;
export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (app && auth && db) {
    console.log('[Firebase] Initializing with authDomain:', firebaseConfig.authDomain);

    // Force browser session persistence so user must log in on fresh browser loads
    setPersistence(auth, browserSessionPersistence).catch((err) => {
        console.error("Failed to set auth persistence:", err);
    });

    // Enable performance optimizations with offline persistence
    enableMultiTabIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Firestore persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
            console.warn('Firestore persistence failed: Browser not supported');
        }
    });
} else {
    console.warn('[Firebase] Firebase client config is incomplete; auth and Firestore are disabled for local dev.');
}
