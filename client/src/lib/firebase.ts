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

// Debug: Verify Firebase config is loaded
if (!firebaseConfig.apiKey) {
    console.error('[Firebase] CRITICAL: VITE_FIREBASE_API_KEY is missing from environment');
}
if (!firebaseConfig.authDomain) {
    console.error('[Firebase] CRITICAL: VITE_FIREBASE_AUTH_DOMAIN is missing from environment');
}
console.log('[Firebase] Initializing with authDomain:', firebaseConfig.authDomain);

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Force browser session persistence so user must log in on fresh browser loads
setPersistence(auth, browserSessionPersistence).catch((err) => {
    console.error("Failed to set auth persistence:", err);
});
export const db = getFirestore(app);

// Enable performance optimizations with offline persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence failed: Browser not supported');
    }
});
