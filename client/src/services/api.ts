import axios, {
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { io } from 'socket.io-client';
import { auth } from "../lib/firebase";

// HARDCODED PRODUCTION URLS (Pick up where env vars failed)
// API Configuration
const VITE_API_URL = import.meta.env.VITE_API_URL || "https://evaraone-production-511c.up.railway.app/api/v1";
const API_BASE_URL = VITE_API_URL.split('/api/v1')[0];
const SOCKET_URL = API_BASE_URL;

console.log('[API Config] Base URL:', API_BASE_URL);
console.log('[API Config] API URL:', VITE_API_URL);

export const socket = io(SOCKET_URL, {
  auth: async (cb) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      cb({ token });
    } else {
      cb({});
    }
  }
});

// Create Axios Instance
const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000, // 15 seconds global timeout for telemetry stability
});

// Request Interceptor: Inject Firebase Auth Token (CRITICAL)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Get Firebase user with timeout protection
      const user = auth.currentUser;
      
      if (!user) {
        console.warn('[API Interceptor] No user logged in, skipping token injection');
        return config;
      }

      // Get fresh ID token
      const token = await user.getIdToken(true); // Force refresh
      config.headers.Authorization = `Bearer ${token}`;
      
      console.log(`[API Interceptor] ✅ Token injected for ${config.method?.toUpperCase()} ${config.url}`);
    } catch (error) {
      console.error("[API Interceptor] Failed to get token:", error);
      // Don't throw - let request proceed (will fail with 401, which is correct)
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
