import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD3NsBa_KfNZmN8dj4ABPJTO3LzuZDExus",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "evaraone-9cde8.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "evaraone-9cde8",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "evaraone-9cde8.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1062775710268",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1062775710268:web:c880c577c65cf5453cd939"
};

// Always enabled — hardcoded fallbacks ensure Firebase initializes even without .env
export const isFirebaseEnabled = true;
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

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
