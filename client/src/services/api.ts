import axios, {
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { io } from 'socket.io-client';
import { auth } from "../lib/firebase";

// API Configuration
// Use environment variable if provided, otherwise fallback to the current origin in production
// or localhost in development. This prevents "not showing data" errors after deployment.
const VITE_API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD 
    ? `${window.location.origin}/api/v1` 
    : "http://localhost:3000/api/v1");

const API_BASE_URL = VITE_API_URL.split('/api/v1')[0];
const SOCKET_URL = API_BASE_URL;

console.log('[API Config] Base URL:', API_BASE_URL);
console.log('[API Config] API URL:', VITE_API_URL);

export const socket = io(SOCKET_URL, {
  auth: async (cb) => {
    const user = auth?.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        cb({ token });
        return;
      } catch { /* fall through to localStorage */ }
    }
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    cb(token ? { token } : {});
  }
});

// Create Axios Instance
const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds global timeout (auth cold-start can be slow)
});

// Request Interceptor: Inject Auth Token (CRITICAL)
// Priority: localStorage first (avoids async Firebase race right after login),
// then fallback to Firebase currentUser.
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // 1. Try stored token FIRST (fastest, avoids async Firebase race)
      const storedToken = localStorage.getItem('auth_token')
        || localStorage.getItem('token')
        || localStorage.getItem('access_token');
      if (storedToken) {
        config.headers.Authorization = `Bearer ${storedToken}`;
        return config;
      }

      // 2. Fallback to Firebase if no stored token
      const firebaseUser = auth?.currentUser;
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('auth_token', token); // cache for next request
          config.headers.Authorization = `Bearer ${token}`;
          return config;
        } catch (e) {
          console.warn('[API Interceptor] Firebase token fetch failed:', e);
        }
      }

      console.warn('[API Interceptor] No token found — request will be unauthorized');
    } catch (error) {
      console.error("[API Interceptor] Failed to get token:", error);
    }
    return config;
  }
);

// Response Interceptor: Auto-unwrap StandardResponse & Handle Errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Standard Response Unwrapping (Envelope Pattern)
    const data = response.data;
    if (
      data &&
      typeof data === "object" &&
      ("status" in data || "success" in data) &&
      "data" in data
    ) {
      return {
        ...response,
        data: data.data,
        meta: data.meta,
      };
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const errorData = error.response?.data as any;
    const message = errorData?.error?.message || errorData?.error || error.message;
    
    console.error(`[API Error] ${status || 'Network'}: ${typeof message === 'object' ? JSON.stringify(message) : message}`, {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
    });
    
    // Log 401 errors specifically for debugging
    if (status === 401) {
      console.error('[API Error] 🔐 AUTHENTICATION FAILED - Check if user is logged in and token is valid');
      const authHeader = (error.config?.headers as any)?.Authorization;
      console.error('[API Error] Authorization header present:', !!authHeader);
    }
    
    return Promise.reject(error);
  },
);

export default api;
